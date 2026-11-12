// Stripe webhook for YOUR platform account (subscriptions to Quorra Dispatch). Deploy with --no-verify-jwt.
// Events: checkout.session.completed, customer.subscription.created, customer.subscription.updated, customer.subscription.deleted, invoice.payment_failed.
// Secrets: STRIPE_SECRET_KEY, STRIPE_BILLING_WEBHOOK_SECRET.
import Stripe from "https://esm.sh/stripe@16.12.0?target=denonext";
import { admin, appUrl, env } from "../_shared/util.ts";
import { sendEmail } from "../_shared/notify.ts";
import { emailHtml } from "../_shared/emailTemplate.ts";
import { authUserIsMissing, isGoneAccountWrite, promoFixAfterRepeatTrial, promoFixPatch, REPEAT_TRIAL_PROMO_DETAIL, subscriptionDeletedIsDone } from "../_shared/promoRecovery.ts";
import { monthlyPromoCoupon } from "../_shared/trialOffer.ts";
import { ensureTrialPromoWithRetry, type PromoFix } from "../_shared/trialSchedule.ts";

const stripe = new Stripe(env("STRIPE_SECRET_KEY"), { httpClient: Stripe.createFetchHttpClient() });
const cryptoProvider = Stripe.createSubtleCryptoProvider();

// Plan name from the price id (STRIPE_PRICE_BASIC / _ESSENTIALS / _ENTERPRISE), so it is right even when the Stripe price has no nickname.
function planName(price?: Stripe.Price | null): string {
  for (const [key, name] of [["BASIC", "Basic"], ["ESSENTIALS", "Essentials"], ["ENTERPRISE", "Enterprise"]]) {
    if (price?.id && (price.id === Deno.env.get(`STRIPE_PRICE_${key}`) || price.id === Deno.env.get(`STRIPE_PRICE_${key}_ANNUAL`))) return name;
  }
  const nick = (price?.nickname ?? "").toLowerCase();
  if (nick === "basic" || nick === "essentials" || nick === "enterprise") return nick.charAt(0).toUpperCase() + nick.slice(1);
  return "Basic";
}

async function save(sub: Stripe.Subscription, promoFix?: PromoFix | null) {
  const db = admin();
  let ownerId = sub.metadata?.owner_id;
  if (!ownerId) {
    const { data } = await db.from("subscriptions").select("owner_id").eq("stripe_customer_id", String(sub.customer)).maybeSingle();
    ownerId = data?.owner_id;
  }
  if (!ownerId) return;
  const item = sub.items.data[0];
  const status = sub.status === "active" || sub.status === "trialing" ? "active" : sub.status === "past_due" ? "past_due" : sub.status === "canceled" || sub.status === "unpaid" ? "canceled" : "incomplete";
  const { data: prev } = await db.from("subscriptions").select("status, past_due_since, trial_used_at").eq("owner_id", ownerId).maybeSingle();
  const pastDueSince = status === "past_due"
    ? (prev?.status === "past_due" && prev.past_due_since ? prev.past_due_since : new Date().toISOString())
    : null;
  const trialUsedAt = prev?.trial_used_at ?? (sub.status === "trialing" ? new Date().toISOString() : null);
  const { error } = await db.from("subscriptions").upsert({
    owner_id: ownerId,
    status,
    plan: planName(item?.price),
    amount_cents: item?.price?.unit_amount ?? 30000,
    billing_interval: item?.price?.recurring?.interval ?? "month",
    past_due_since: pastDueSince,
    trial_used_at: trialUsedAt,
    // Newer Stripe API versions keep the period end on the item; a scheduled cancel date wins when there is one.
    current_period_end: (() => {
      const t = sub.cancel_at ?? (item as unknown as { current_period_end?: number })?.current_period_end ?? (sub as unknown as { current_period_end?: number }).current_period_end ?? sub.trial_end;
      return t ? new Date(t * 1000).toISOString() : null;
    })(),
    cancel_at_period_end: Boolean(sub.cancel_at_period_end || sub.cancel_at),
    trialing: sub.status === "trialing",
    stripe_customer_id: String(sub.customer),
    stripe_subscription_id: sub.id,
    updated_at: new Date().toISOString(),
    ...(promoFixPatch(promoFix ?? null) ?? {}),
  }, { onConflict: "owner_id" });
  if (error) throw error;
}

async function cardFingerprint(sub: Stripe.Subscription): Promise<string | null> {
  const pm = sub.default_payment_method;
  const pmId = typeof pm === "string" ? pm : pm?.id;
  if (!pmId) return null;
  try {
    const method = await stripe.paymentMethods.retrieve(pmId);
    return method.card?.fingerprint ?? null;
  } catch (e) {
    console.error("trial card", e);
    return null;
  }
}

/** A card that already trialed on another customer does not get a second free trial. */
async function stopRepeatTrial(sub: Stripe.Subscription): Promise<Stripe.Subscription> {
  if (sub.status !== "trialing") return sub;
  const fingerprint = await cardFingerprint(sub);
  if (!fingerprint) return sub;
  const customer = String(sub.customer);
  const { data, error } = await admin().from("trial_ledger").select("stripe_customer_id").eq("kind", "card").eq("value", fingerprint).maybeSingle();
  if (error) { console.error(error); return sub; }
  const owner = data?.stripe_customer_id as string | undefined;
  if (!owner || owner === customer) return sub;
  return stripe.subscriptions.update(sub.id, { trial_end: "now", proration_behavior: "none" });
}

async function rememberTrial(sub: Stripe.Subscription): Promise<void> {
  const customer = String(sub.customer);
  let email = "";
  try {
    const person = await stripe.customers.retrieve(customer);
    if (!person.deleted) email = person.email ?? "";
  } catch (e) {
    console.error("trial customer", e);
  }
  const { error } = await admin().rpc("claim_trial", {
    p_email: email, p_card: await cardFingerprint(sub), p_customer: customer,
  });
  if (error) console.error("trial ledger", error);
}

/** New trials (promo_schedule=pending) get the post-trial discount. Existing subscriptions are not rewritten. */
async function prepareSubscription(sub: Stripe.Subscription): Promise<{ subscription: Stripe.Subscription; fix: PromoFix | null }> {
  const wasTrialing = sub.status === "trialing";
  const promoSchedule = sub.metadata?.promo_schedule;
  try { sub = await stopRepeatTrial(sub); } catch (e) { console.error("repeat trial", e); }
  const price = sub.items.data[0]?.price;
  const interval = price?.recurring?.interval === "year" ? "year" : "month";
  const applied = await ensureTrialPromoWithRetry(stripe, sub, monthlyPromoCoupon(interval, Deno.env.get("STRIPE_PROMO_COUPON")));
  sub = applied.subscription;
  try { await rememberTrial(sub); } catch (e) { console.error("trial ledger", e); }
  const fix = promoFixAfterRepeatTrial({
    wasTrialing,
    promoSchedule,
    statusAfter: sub.status,
    promoScheduleAfter: sub.metadata?.promo_schedule,
    fix: applied.fix,
  });
  if (fix?.detail === REPEAT_TRIAL_PROMO_DETAIL) console.error(REPEAT_TRIAL_PROMO_DETAIL, sub.id);
  return { subscription: sub, fix };
}

/** delete-account removes the login (and the business cascades) before this event arrives. */
async function deletedAccountIsDone(sub: Stripe.Subscription): Promise<boolean> {
  const db = admin();
  let ownerId = sub.metadata?.owner_id;
  if (!ownerId) {
    const { data, error } = await db.from("subscriptions").select("owner_id").eq("stripe_customer_id", String(sub.customer)).maybeSingle();
    if (error) throw error;
    ownerId = data?.owner_id as string | undefined;
  }
  if (!ownerId) return true;
  const userRes = await db.auth.admin.getUserById(ownerId);
  if (userRes.error && !authUserIsMissing(userRes.error)) throw userRes.error;
  const userMissing = Boolean(userRes.error) || !userRes.data?.user;
  const [biz, row] = await Promise.all([
    db.from("business").select("owner_id").eq("owner_id", ownerId).maybeSingle(),
    db.from("subscriptions").select("owner_id").eq("owner_id", ownerId).maybeSingle(),
  ]);
  if (biz.error) throw biz.error;
  if (row.error) throw row.error;
  return subscriptionDeletedIsDone({
    userMissing,
    businessMissing: !biz.data,
    subscriptionPresent: Boolean(row.data),
  });
}

/** A second Stripe subscription must not replace the one the customer is still on. */
async function isStaleSecondSub(live: Stripe.Subscription): Promise<boolean> {
  const db = admin();
  let ownerId = live.metadata?.owner_id;
  if (!ownerId) {
    const { data } = await db.from("subscriptions").select("owner_id").eq("stripe_customer_id", String(live.customer)).maybeSingle();
    ownerId = data?.owner_id as string | undefined;
  }
  if (!ownerId) return false;
  const { data: row } = await db.from("subscriptions").select("stripe_subscription_id").eq("owner_id", ownerId).maybeSingle();
  const storedId = row?.stripe_subscription_id as string | undefined;
  if (!storedId || storedId === live.id) return false;
  try {
    const stored = await stripe.subscriptions.retrieve(storedId);
    if (stored.status === "active" || stored.status === "trialing") {
      console.log(`skip ${live.id}: stored ${storedId} is ${stored.status}`);
      return true;
    }
  } catch (e) {
    console.log(`stored subscription ${storedId} could not be retrieved`, e);
  }
  return false;
}

Deno.serve(async (req) => {
  const sig = req.headers.get("stripe-signature");
  if (!sig) return new Response("missing signature", { status: 400 });
  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig, env("STRIPE_BILLING_WEBHOOK_SECRET"), undefined, cryptoProvider);
  } catch {
    return new Response("invalid signature", { status: 400 });
  }
  try {
    console.log(event.type);
    if (event.type === "checkout.session.completed") {
      const s = event.data.object as Stripe.Checkout.Session;
      if (s.mode === "subscription" && s.subscription) {
        const prepared = await prepareSubscription(await stripe.subscriptions.retrieve(String(s.subscription)));
        await save(prepared.subscription, prepared.fix);
      }
    } else if (event.type.startsWith("customer.subscription.")) {
      const incoming = event.data.object as Stripe.Subscription;
      const prepared = await prepareSubscription(await stripe.subscriptions.retrieve(incoming.id));
      const live = prepared.subscription;
      console.log(`${event.type} sub=${live.id} event_status=${incoming.status} live_status=${live.status}`);
      // The company is already gone. Ack the event so Stripe does not retry it for days.
      if (event.type === "customer.subscription.deleted" && await deletedAccountIsDone(live)) {
        console.log(`subscription.deleted for ${live.id} already gone`);
      } else if (!(await isStaleSecondSub(live))) await save(live, prepared.fix);
    } else if (event.type === "invoice.paid") {
      // Our own branded receipt. In Stripe, turn off "Successful payments" customer emails so they do not get two.
      const inv = event.data.object as Stripe.Invoice;
      if (inv.customer_email && inv.amount_paid > 0) {
        const amt = `$${(inv.amount_paid / 100).toFixed(2)}`;
        const link = `${appUrl()}/billing`; // receipts are our own PDF inside the app
        await sendEmail({
          to: inv.customer_email,
          subject: `Receipt for your Quorra Dispatch payment (${amt})`,
          text: `Thanks for your payment of ${amt} to Quorra Dispatch.${link ? `\n\nDownload your receipt from Billing: ${link}` : ""}\n\nQuestions? Reply to this email.`,
          html: emailHtml({ heading: "Thanks for your payment", paragraphs: [`We received your payment of ${amt} for Quorra Dispatch.`], rows: [{ label: "Amount", value: amt }, { label: "Date", value: new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) }], button: link ? { label: "Open billing", url: link } : undefined, fine: "Questions about your bill? Just reply to this email." }),
        });
      }
    } else if (event.type === "invoice.payment_failed") {
      const inv = event.data.object as Stripe.Invoice & { parent?: { subscription_details?: { subscription?: string | { id: string } | null } } };
      const raw = inv.parent?.subscription_details?.subscription;
      const subId = typeof raw === "string" ? raw : raw?.id;
      if (subId) await save(await stripe.subscriptions.retrieve(subId));
    }
  } catch (e) {
    console.error(e);
    // A missing login or business fails the foreign key. That delete is finished.
    // Anything else (a dropped connection, a lock) is still retried.
    if (isGoneAccountWrite(e)) return new Response("ok");
    return new Response("error", { status: 500 });
  }
  return new Response("ok");
});
