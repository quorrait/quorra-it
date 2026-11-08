// Change plan, cancel at period end, or resume, all from inside the app (no Stripe screens). Signed-in owner only (Verify JWT ON).
// Secrets: STRIPE_SECRET_KEY (needs Subscriptions: write), STRIPE_PRICE_<PLAN> and STRIPE_PRICE_<PLAN>_ANNUAL.
import Stripe from "https://esm.sh/stripe@16.12.0?target=denonext";
import { accountOwner, admin, env, handler, HttpError, json, requireUser } from "../_shared/util.ts";

handler(async (req) => {
  const user = await requireUser(req);
  if ((await accountOwner(user.id)) !== user.id) throw new HttpError(403, "Only the account owner can manage billing");
  const b = await req.json().catch(() => ({}));
  const db = admin();
  const { data: sub } = await db.from("subscriptions").select("stripe_subscription_id").eq("owner_id", user.id).maybeSingle();
  if (!sub?.stripe_subscription_id) throw new HttpError(400, "No subscription yet. Subscribe first.");
  const stripe = new Stripe(env("STRIPE_SECRET_KEY"), { httpClient: Stripe.createFetchHttpClient() });
  const id = sub.stripe_subscription_id as string;

  if (b.action === "cancel") {
    await stripe.subscriptions.update(id, { cancel_at_period_end: true });
    await db.from("subscriptions").update({ cancel_at_period_end: true }).eq("owner_id", user.id);
    return json({ ok: true });
  }
  if (b.action === "resume") {
    const cur = await stripe.subscriptions.retrieve(id);
    // Stripe accepts only one of the two; clear whichever one is set.
    await stripe.subscriptions.update(id, cur.cancel_at ? { cancel_at: "" as unknown as undefined } : { cancel_at_period_end: false });
    await db.from("subscriptions").update({ cancel_at_period_end: false }).eq("owner_id", user.id);
    return json({ ok: true });
  }
  if (b.action === "change") {
    const plan = String(b.plan ?? "").toLowerCase();
    if (!["basic", "essentials", "enterprise"].includes(plan)) throw new HttpError(400, "Unknown plan");
    const priceId = env(`STRIPE_PRICE_${plan.toUpperCase()}${b.interval === "year" ? "_ANNUAL" : ""}`);
    const cur = await stripe.subscriptions.retrieve(id);
    const item = cur.items.data[0];
    await stripe.subscriptions.update(id, { items: [{ id: item.id, price: priceId }], proration_behavior: "create_prorations", cancel_at_period_end: false });
    return json({ ok: true });
  }
  throw new HttpError(400, "Unknown action");
});
