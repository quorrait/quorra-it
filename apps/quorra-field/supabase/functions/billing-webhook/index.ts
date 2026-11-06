// Stripe webhook for YOUR platform account (subscriptions to Quorra Dispatch). Deploy with --no-verify-jwt.
// Events: checkout.session.completed, customer.subscription.created, customer.subscription.updated, customer.subscription.deleted, invoice.payment_failed.
// Secrets: STRIPE_SECRET_KEY, STRIPE_BILLING_WEBHOOK_SECRET.
import Stripe from "https://esm.sh/stripe@16.12.0?target=denonext";
import { admin, env } from "../_shared/util.ts";

const stripe = new Stripe(env("STRIPE_SECRET_KEY"), { httpClient: Stripe.createFetchHttpClient() });
const cryptoProvider = Stripe.createSubtleCryptoProvider();

// Plan name from the price id (STRIPE_PRICE_BASIC / _ESSENTIALS / _ENTERPRISE), so it is right even when the Stripe price has no nickname.
function planName(price?: Stripe.Price | null): string {
  for (const [key, name] of [["BASIC", "Basic"], ["ESSENTIALS", "Essentials"], ["ENTERPRISE", "Enterprise"]]) {
    if (price?.id && price.id === Deno.env.get(`STRIPE_PRICE_${key}`)) return name;
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
    current_period_end: new Date((sub.current_period_end ?? 0) * 1000).toISOString(),
    cancel_at_period_end: sub.cancel_at_period_end,
    stripe_customer_id: String(sub.customer),
    stripe_subscription_id: sub.id,
    updated_at: new Date().toISOString(),
  }, { onConflict: "owner_id" });
  if (error) throw error;
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
    if (event.type === "checkout.session.completed") {
      const s = event.data.object as Stripe.Checkout.Session;
      if (s.mode === "subscription" && s.subscription) await save(await stripe.subscriptions.retrieve(String(s.subscription)));
    } else if (event.type.startsWith("customer.subscription.")) {
      await save(event.data.object as Stripe.Subscription);
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
