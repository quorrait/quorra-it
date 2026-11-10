// Stripe webhook for YOUR platform account (subscriptions to Quorra Dispatch). Deploy with --no-verify-jwt.
// Events: checkout.session.completed, customer.subscription.created, customer.subscription.updated, customer.subscription.deleted, invoice.payment_failed.
// Secrets: STRIPE_SECRET_KEY, STRIPE_BILLING_WEBHOOK_SECRET.
import Stripe from "https://esm.sh/stripe@16.12.0?target=denonext";
import { admin, appUrl, env } from "../_shared/util.ts";
import { sendEmail } from "../_shared/notify.ts";
import { emailHtml } from "../_shared/emailTemplate.ts";

const stripe = new Stripe(env("STRIPE_SECRET_KEY"), { httpClient: Stripe.createFetchHttpClient() });
const cryptoProvider = Stripe.createSubtleCryptoProvider();

// Plan name from the price id (STRIPE_PRICE_BASIC / _ESSENTIALS / _ENTERPRISE), so it is right even when the Stripe price has no nickname.
function planName(price?: Stripe.Price | null): string {
  for (const [key, name] of [["BASIC", "Basic"], ["ESSENTIALS", "Essentials"], ["ENTERPRISE", "Enterprise"]]) {
    if (price?.id && (price.id === Deno.env.get(`STRIPE_PRICE_${key}`) || price.id === Deno.env.get(`STRIPE_PRICE_${key}_ANNUAL`))) return name;
  }
  return price?.nickname || "Quorra Dispatch";
}

async function save(sub: Stripe.Subscription) {
  const db = admin();
  let ownerId = sub.metadata?.owner_id;
  if (!ownerId) {
    const { data } = await db.from("subscriptions").select("owner_id").eq("stripe_customer_id", String(sub.customer)).maybeSingle();
    ownerId = data?.owner_id;
  }
  if (!ownerId) return;
  const item = sub.items.data[0];
  const status = sub.status === "active" || sub.status === "trialing" ? "active" : sub.status === "past_due" || sub.status === "unpaid" ? "past_due" : sub.status === "canceled" ? "canceled" : "incomplete";
  const { error } = await db.from("subscriptions").upsert({
    owner_id: ownerId,
    status,
    plan: planName(item?.price),
    amount_cents: item?.price?.unit_amount ?? 30000,
    billing_interval: item?.price?.recurring?.interval ?? "month",
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
  }, { onConflict: "owner_id" });
  if (error) throw error;
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
      if (s.mode === "subscription" && s.subscription) await save(await stripe.subscriptions.retrieve(String(s.subscription)));
    } else if (event.type.startsWith("customer.subscription.")) {
      const incoming = event.data.object as Stripe.Subscription;
      const live = await stripe.subscriptions.retrieve(incoming.id);
      console.log(`${event.type} sub=${live.id} event_status=${incoming.status} live_status=${live.status}`);
      if (!(await isStaleSecondSub(live))) await save(live);
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
      const inv = event.data.object as Stripe.Invoice;
      if (inv.subscription) await save(await stripe.subscriptions.retrieve(String(inv.subscription)));
    }
  } catch (e) {
    console.error(e);
    return new Response("error", { status: 500 }); // Stripe retries
  }
  return new Response("ok");
});
