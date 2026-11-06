// Lists what the owner has been charged for their Quorra Dispatch plan (Stripe invoices), newest first.
// Secrets: STRIPE_SECRET_KEY.
import Stripe from "https://esm.sh/stripe@16.12.0?target=denonext";
import { accountOwner, admin, env, handler, HttpError, json, requireUser } from "../_shared/util.ts";

handler(async (req) => {
  const user = await requireUser(req);
  if ((await accountOwner(user.id)) !== user.id) throw new HttpError(403, "Only the account owner can see billing");
  const { data: sub } = await admin().from("subscriptions").select("stripe_customer_id").eq("owner_id", user.id).maybeSingle();
  if (!sub?.stripe_customer_id) return json({ charges: [] });
  const stripe = new Stripe(env("STRIPE_SECRET_KEY"), { httpClient: Stripe.createFetchHttpClient() });
  const list = await stripe.invoices.list({ customer: sub.stripe_customer_id, limit: 24 });
  const charges = list.data
    .filter((i) => i.status !== "draft")
    .map((i) => ({
      id: i.id,
      date: new Date((i.status_transitions?.paid_at ?? i.created) * 1000).toISOString(),
      description: i.lines.data.map((l) => l.price?.nickname || l.description || "Quorra Dispatch").join(", "),
      amount_cents: i.amount_paid || i.amount_due,
      status: i.status === "paid" ? "paid" : i.status === "open" ? "unpaid" : String(i.status),
      receipt_url: i.hosted_invoice_url ?? null,
    }));
  return json({ charges });
});
