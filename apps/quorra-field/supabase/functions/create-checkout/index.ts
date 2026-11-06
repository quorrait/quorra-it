// Creates a Stripe Checkout page for an invoice's remaining balance, charged on the contractor's own Stripe account.
import Stripe from "https://esm.sh/stripe@16.12.0?target=denonext";
import { admin, appUrl, env, handler, HttpError, invoiceTotalCents, json, requireUser, accountOwner } from "../_shared/util.ts";

handler(async (req) => {
  const user = await requireUser(req);
  const ownerId = await accountOwner(user.id);
  const { invoice_id } = await req.json();
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

  const { data: cust } = await db.from("customers").select("name, email").eq("id", inv.customer_id).maybeSingle();

  const stripe = new Stripe(env("STRIPE_SECRET_KEY"), { httpClient: Stripe.createFetchHttpClient() });
  const meta = { invoice_id: inv.id, owner_id: ownerId };
  const session = await stripe.checkout.sessions.create(
    {
      mode: "payment",
      customer_email: cust?.email || undefined,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: balance,
            product_data: { name: `Invoice #${inv.number} · ${biz.name}` },
          },
        },
      ],
      metadata: meta,
      payment_intent_data: { metadata: meta, description: `Invoice #${inv.number}` },
      success_url: `${appUrl()}/invoices/${inv.id}?paid=1`,
      cancel_url: `${appUrl()}/invoices/${inv.id}`,
    },
    { stripeAccount: biz.stripe_account_id },
  );

  return json({ url: session.url });
});
