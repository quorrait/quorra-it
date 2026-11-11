// Starts a Stripe Checkout subscription for the business owner (Quorra Dispatch plan).
// Secrets: STRIPE_SECRET_KEY, STRIPE_PRICE_BASIC / _ESSENTIALS / _ENTERPRISE, PUBLIC_APP_URL (or APP_URL).
// Optional: STRIPE_PROMO_COUPON (monthly only; leave unset to turn the launch offer off).
import Stripe from "https://esm.sh/stripe@16.12.0?target=denonext";
import { accountOwner, admin, appUrl, env, handler, HttpError, json, requireUser } from "../_shared/util.ts";

handler(async (req) => {
  const user = await requireUser(req);
  if ((await accountOwner(user.id)) !== user.id) throw new HttpError(403, "Only the account owner can manage billing");
  const body = await req.json().catch(() => ({}));
  // Secrets: STRIPE_PRICE_BASIC, STRIPE_PRICE_ESSENTIALS, STRIPE_PRICE_ENTERPRISE (the price ids from Stripe).
  const plan = String(body.plan ?? "essentials").toLowerCase();
  if (!["basic", "essentials", "enterprise"].includes(plan)) throw new HttpError(400, "Unknown plan");
  const yearly = body.interval === "year";
  const priceId = env(`STRIPE_PRICE_${plan.toUpperCase()}${yearly ? "_ANNUAL" : ""}`);

  const db = admin();
  const stripe = new Stripe(env("STRIPE_SECRET_KEY"), { httpClient: Stripe.createFetchHttpClient() });
  const { data: sub } = await db.from("subscriptions").select("stripe_customer_id, stripe_subscription_id").eq("owner_id", user.id).maybeSingle();
  if (sub?.stripe_subscription_id) {
    try {
      const existing = await stripe.subscriptions.retrieve(sub.stripe_subscription_id as string);
      if (existing.status === "active" || existing.status === "trialing" || existing.status === "past_due") {
        throw new HttpError(409, "You already have a subscription. Change your plan on the Billing page, or open the billing portal.");
      }
    } catch (e) {
      if (e instanceof HttpError) throw e;
    }
  }
  let customer = sub?.stripe_customer_id as string | undefined;
  if (!customer) {
    const c = await stripe.customers.create({ email: user.email ?? undefined, metadata: { owner_id: user.id } });
    customer = c.id;
    await db.from("subscriptions").upsert({ owner_id: user.id, stripe_customer_id: customer }, { onConflict: "owner_id" });
  }

  // Annual prices already include 10% off. The launch coupon is monthly only, and only while the secret is set.
  // Do not also set allow_promotion_codes: Stripe rejects a session that has both.
  const promo = yearly ? "" : (Deno.env.get("STRIPE_PROMO_COUPON") ?? "").trim();
  const prior = await stripe.subscriptions.list({ customer, status: "all", limit: 1 });
  const { data: trialRow } = await db.from("subscriptions").select("trial_used_at").eq("owner_id", user.id).maybeSingle();
  const grantTrial = prior.data.length === 0 && !trialRow?.trial_used_at;
  const base = {
    mode: "subscription" as const,
    customer,
    client_reference_id: user.id,
    line_items: [{ price: priceId, quantity: 1 }],
    metadata: { owner_id: user.id },
    subscription_data: {
      ...(grantTrial ? { trial_period_days: 14 } : {}),
      metadata: { owner_id: user.id },
      ...(promo ? { discounts: [{ coupon: promo }] } : {}),
    },
    // Set the secret STRIPE_AUTOMATIC_TAX to "true" once Stripe Tax is set up (head office address, registrations, SaaS tax code on the products).
    ...(Deno.env.get("STRIPE_AUTOMATIC_TAX") === "true" ? { automatic_tax: { enabled: true }, billing_address_collection: "required" as const, customer_update: { address: "auto" as const } } : {}),
  };
  if (body.embedded) {
    // Shown inside our own page; no redirect to Stripe. Needs the publishable key (pk_live_...) as a secret.
    const session = await stripe.checkout.sessions.create({ ...base, ui_mode: "embedded", redirect_on_completion: "never" });
    return json({ client_secret: session.client_secret, publishable_key: env("STRIPE_PUBLISHABLE_KEY") });
  }
  const session = await stripe.checkout.sessions.create({
    ...base,
    success_url: `${appUrl()}/billing?subscribed=1`,
    cancel_url: `${appUrl()}/billing`,
  });
  return json({ url: session.url });
});
