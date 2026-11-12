// Public: starts a card payment for one of the customer's invoices, identified by their portal token. Deploy with --no-verify-jwt.
import Stripe from "https://esm.sh/stripe@16.12.0?target=denonext";
import { admin, appUrl, env, handler, HttpError, invoiceTotalCents, json } from "../_shared/util.ts";
import { checkoutPaidUrl, portalPayReturn } from "../_shared/safeUrl.ts";

handler(async (req) => {
  const { t, invoice_id, return_to } = await req.json().catch(() => ({}));
  if (!t || String(t).length < 16 || !invoice_id) throw new HttpError(400, "Invalid request");
  const db = admin();
  const { data: cust } = await db.from("customers").select("id,owner_id,email").eq("portal_token", t).maybeSingle();
  if (!cust) throw new HttpError(404, "This link is not valid");
  const { data: inv } = await db.from("invoices").select("*").eq("id", invoice_id).eq("customer_id", cust.id).maybeSingle();
  if (!inv) throw new HttpError(404, "Invoice not found");
  if (inv.status !== "sent") throw new HttpError(400, "This invoice is not open for payment");
  const { data: biz } = await db.from("business").select("name,stripe_account_id,stripe_connected").eq("owner_id", cust.owner_id).maybeSingle();
  if (!biz?.stripe_account_id || !biz.stripe_connected) throw new HttpError(400, "Online payment is not available. Please contact the business.");
  const { data: pays } = await db.from("payments").select("amount_cents").eq("invoice_id", inv.id);
  const paid = (pays ?? []).reduce((s: number, p: { amount_cents: number }) => s + p.amount_cents, 0);
  const balance = invoiceTotalCents(inv.items, Number(inv.tax_rate)) - paid;
  if (balance <= 0) throw new HttpError(400, "Nothing left to pay");
  const back = portalPayReturn(return_to, appUrl(), String(t));
  const stripe = new Stripe(env("STRIPE_SECRET_KEY"), { httpClient: Stripe.createFetchHttpClient() });
  const meta = { invoice_id: inv.id, owner_id: cust.owner_id };
  const session = await stripe.checkout.sessions.create(
    {
      mode: "payment",
      customer_email: cust.email || undefined,
      line_items: [{ quantity: 1, price_data: { currency: "usd", unit_amount: balance, product_data: { name: `Invoice #${inv.number} · ${biz.name}` } } }],
      metadata: meta,
      payment_intent_data: { metadata: meta, description: `Invoice #${inv.number}` },
      success_url: checkoutPaidUrl(back),
      cancel_url: back || "https://stripe.com",
    },
    { stripeAccount: biz.stripe_account_id },
  );
  return json({ url: session.url });
});
