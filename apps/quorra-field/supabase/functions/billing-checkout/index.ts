// Starts a Stripe Checkout subscription for the business owner (Quorra Dispatch plan).
// Secrets: STRIPE_SECRET_KEY, STRIPE_PRICE_SOLO / _CREW / _COMPANY, APP_URL.
import Stripe from "https://esm.sh/stripe@16.12.0?target=denonext";
import { accountOwner, admin, appUrl, env, handler, HttpError, json, requireUser } from "../_shared/util.ts";

handler(async (req) => {
  const user = await requireUser(req);
  if ((await accountOwner(user.id)) !== user.id) throw new HttpError(403, "Only the account owner can manage billing");
  const body = await req.json().catch(() => ({}));
  // Secrets: STRIPE_PRICE_SOLO, STRIPE_PRICE_CREW, STRIPE_PRICE_COMPANY (the price ids from Stripe).
  const plan = String(body.plan ?? "crew").toLowerCase();
  if (!["solo", "crew", "company"].includes(plan)) throw new HttpError(400, "Unknown plan");
  const priceId = env(`STRIPE_PRICE_${plan.toUpperCase()}`);

  const db = admin();
  const stripe = new Stripe(env("STRIPE_SECRET_KEY"), { httpClient: Stripe.createFetchHttpClient() });
  const { data: sub } = await db.from("subscriptions").select("stripe_customer_id").eq("owner_id", user.id).maybeSingle();
  let customer = sub?.stripe_customer_id as string | undefined;
  if (!customer) {
    const c = await stripe.customers.create({ email: user.email ?? undefined, metadata: { owner_id: user.id } });
    customer = c.id;
    await db.from("subscriptions").upsert({ owner_id: user.id, stripe_customer_id: customer }, { onConflict: "owner_id" });
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer,
    client_reference_id: user.id,
    line_items: [{ price: priceId, quantity: 1 }],
    metadata: { owner_id: user.id },
    subscription_data: { metadata: { owner_id: user.id } },
    success_url: `${appUrl()}/billing?subscribed=1`,
    cancel_url: `${appUrl()}/billing`,
  });
  return json({ url: session.url });
});
