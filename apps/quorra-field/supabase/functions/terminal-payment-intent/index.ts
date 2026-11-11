// Card-present PaymentIntent for Tap to Pay, on the contractor's connected account.
// Signed-in user only (Verify JWT ON). stripe-webhook records payment_intent.succeeded the same way as Checkout.
import Stripe from "https://esm.sh/stripe@16.12.0?target=denonext";
import { admin, env, handler, HttpError, invoiceTotalCents, json, requireUser, accountOwner } from "../_shared/util.ts";

handler(async (req) => {
  if (req.method !== "POST") throw new HttpError(405, "POST only");
  const user = await requireUser(req);
  const ownerId = await accountOwner(user.id);
  const { invoice_id } = await req.json().catch(() => ({}));
  if (!invoice_id) throw new HttpError(400, "invoice_id required");
  const db = admin();
  const { data: inv } = await db.from("invoices").select("*").eq("id", invoice_id).eq("owner_id", ownerId).maybeSingle();
  if (!inv) throw new HttpError(404, "Invoice not found");
  if (inv.status !== "sent") throw new HttpError(400, "Mark the invoice as sent before taking payment");
  const { data: biz } = await db.from("business").select("name, stripe_account_id, stripe_connected").eq("owner_id", ownerId).maybeSingle();
  if (!biz?.stripe_account_id || !biz.stripe_connected) throw new HttpError(400, "Connect Stripe in Settings first");
  const { data: pays } = await db.from("payments").select("amount_cents").eq("invoice_id", inv.id);
  const paid = (pays ?? []).reduce((s: number, p: { amount_cents: number }) => s + p.amount_cents, 0);
  const balance = invoiceTotalCents(inv.items, Number(inv.tax_rate)) - paid;
  if (balance <= 0) throw new HttpError(400, "Nothing left to pay");

  const stripe = new Stripe(env("STRIPE_SECRET_KEY"), { httpClient: Stripe.createFetchHttpClient() });
  const meta = { invoice_id: inv.id, owner_id: ownerId };
  const intent = await stripe.paymentIntents.create({
    amount: balance,
    currency: "usd",
    payment_method_types: ["card_present"],
    capture_method: "automatic",
    description: `Invoice #${inv.number}`,
    metadata: meta,
  }, { stripeAccount: biz.stripe_account_id });
  if (!intent.client_secret) throw new HttpError(500, "Stripe did not return a payment secret");
  return json({ id: intent.id, client_secret: intent.client_secret });
});
