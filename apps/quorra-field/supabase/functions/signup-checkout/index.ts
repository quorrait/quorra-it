// Step 1 of signup: collects and verifies the card BEFORE any account exists. Public (deploy with Verify JWT OFF).
// Secrets: STRIPE_SECRET_KEY, STRIPE_PUBLISHABLE_KEY, STRIPE_PRICE_BASIC / _ESSENTIALS / _ENTERPRISE (and _ANNUAL).
import Stripe from "https://esm.sh/stripe@16.12.0?target=denonext";
import { admin, env, handler, HttpError, json } from "../_shared/util.ts";
import { clientIp, rateLimit } from "../_shared/limit.ts";

handler(async (req) => {
  await rateLimit("signup-checkout", clientIp(req), 8, 60 * 60);
  const b = await req.json().catch(() => ({}));
  const email = String(b.email ?? "").trim().toLowerCase();
  const name = String(b.name ?? "").trim().slice(0, 80);
  const business = String(b.business ?? "").trim().slice(0, 100);
  const plan = String(b.plan ?? "essentials").toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, "Enter a valid email address.");
  if (!name) throw new HttpError(400, "Enter your name.");
  if (!business) throw new HttpError(400, "Enter your business name.");
  if (!["basic", "essentials", "enterprise"].includes(plan)) throw new HttpError(400, "Unknown plan");
  // Stop early if this email already has a login, so nobody pays for an account that cannot be created.
  const { data: taken } = await admin().rpc("email_in_use", { p_email: email });
  if (taken === true) throw new HttpError(409, "We could not start signup for that email. If you already have an account, sign in.");

  const stripe = new Stripe(env("STRIPE_SECRET_KEY"), { httpClient: Stripe.createFetchHttpClient() });
  const found = await stripe.customers.search({ query: `email:"${email.replace(/"/g, "")}"`, limit: 1 });
  const customer = found.data[0] ?? await stripe.customers.create({ email, name, metadata: { business, signup: "1" } });
  if (found.data[0]) await stripe.customers.update(customer.id, { name, metadata: { business, signup: "1" } });
  const session = await stripe.checkout.sessions.create({
    mode: "setup",
    currency: "usd",
    customer: customer.id,
    ui_mode: "embedded",
    redirect_on_completion: "never",
    payment_method_types: ["card"],
    billing_address_collection: "required",
    metadata: { signup: "1", email, plan, interval: b.interval === "year" ? "year" : "month", name, business },
  });
  return json({ client_secret: session.client_secret, publishable_key: env("STRIPE_PUBLISHABLE_KEY"), session_id: session.id });
});
