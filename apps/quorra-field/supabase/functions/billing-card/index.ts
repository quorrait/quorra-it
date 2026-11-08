// Update the card on file without leaving the app (embedded Stripe form). Signed-in owner only (Verify JWT ON).
// Secrets: STRIPE_SECRET_KEY, STRIPE_PUBLISHABLE_KEY.
import Stripe from "https://esm.sh/stripe@16.12.0?target=denonext";
import { accountOwner, admin, env, handler, HttpError, json, requireUser } from "../_shared/util.ts";

handler(async (req) => {
  const user = await requireUser(req);
  if ((await accountOwner(user.id)) !== user.id) throw new HttpError(403, "Only the account owner can manage billing");
  const b = await req.json().catch(() => ({}));
  const { data: sub } = await admin().from("subscriptions").select("stripe_customer_id, stripe_subscription_id").eq("owner_id", user.id).maybeSingle();
  if (!sub?.stripe_customer_id) throw new HttpError(400, "No billing account yet");
  const stripe = new Stripe(env("STRIPE_SECRET_KEY"), { httpClient: Stripe.createFetchHttpClient() });

  if (b.action === "finish") {
    const s = await stripe.checkout.sessions.retrieve(String(b.session_id), { expand: ["setup_intent"] });
    if (s.customer !== sub.stripe_customer_id) throw new HttpError(403, "Not your session");
    const pm = (s.setup_intent as Stripe.SetupIntent | null)?.payment_method;
    if (!pm) throw new HttpError(400, "Card was not saved");
    const id = typeof pm === "string" ? pm : pm.id;
    await stripe.customers.update(sub.stripe_customer_id, { invoice_settings: { default_payment_method: id } });
    if (sub.stripe_subscription_id) await stripe.subscriptions.update(sub.stripe_subscription_id, { default_payment_method: id });
    return json({ ok: true });
  }
  // The card currently on file, so the owner can see what they are replacing.
  let current: { brand: string; last4: string; exp_month: number; exp_year: number } | null = null;
  try {
    const cust = await stripe.customers.retrieve(sub.stripe_customer_id) as Stripe.Customer;
    let pmId = cust.invoice_settings?.default_payment_method as string | null;
    if (!pmId && sub.stripe_subscription_id) { const s = await stripe.subscriptions.retrieve(sub.stripe_subscription_id); pmId = s.default_payment_method as string | null; }
    const pm = pmId ? await stripe.paymentMethods.retrieve(pmId) : (await stripe.paymentMethods.list({ customer: sub.stripe_customer_id, type: "card", limit: 1 })).data[0];
    if (pm?.card) current = { brand: pm.card.brand, last4: pm.card.last4, exp_month: pm.card.exp_month, exp_year: pm.card.exp_year };
  } catch { /* showing the card is a convenience */ }
  const session = await stripe.checkout.sessions.create({
    mode: "setup",
    currency: "usd",
    customer: sub.stripe_customer_id,
    ui_mode: "embedded",
    redirect_on_completion: "if_required",
    payment_method_types: ["card"],
  });
  return json({ client_secret: session.client_secret, publishable_key: env("STRIPE_PUBLISHABLE_KEY"), current });
});
