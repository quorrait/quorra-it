// Stripe Connect webhook. Deploy with --no-verify-jwt (Stripe calls it, not a signed-in user).
// Events to send: checkout.session.completed, checkout.session.async_payment_succeeded, account.updated  ("Events on Connected accounts").
import Stripe from "https://esm.sh/stripe@16.12.0?target=denonext";
import { admin, env } from "../_shared/util.ts";

const stripe = new Stripe(env("STRIPE_SECRET_KEY"), { httpClient: Stripe.createFetchHttpClient() });
const cryptoProvider = Stripe.createSubtleCryptoProvider();

Deno.serve(async (req) => {
  const sig = req.headers.get("stripe-signature");
  if (!sig) return new Response("missing signature", { status: 400 });
  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig, env("STRIPE_WEBHOOK_SECRET"), undefined, cryptoProvider);
  } catch (e) {
    console.error("bad signature", e);
    return new Response("invalid signature", { status: 400 });
  }

  const db = admin();

  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    const s = event.data.object as Stripe.Checkout.Session;
    if (s.payment_status === "paid" && s.metadata?.invoice_id && s.metadata?.owner_id) {
      // Make sure the invoice really belongs to the owner named in the metadata and to the account that sent this event.
      const { data: biz } = await db.from("business").select("stripe_account_id").eq("owner_id", s.metadata.owner_id).maybeSingle();
      const { data: inv } = await db.from("invoices").select("id").eq("id", s.metadata.invoice_id).eq("owner_id", s.metadata.owner_id).maybeSingle();
      if (inv && biz?.stripe_account_id && biz.stripe_account_id === event.account) {
        const pi = typeof s.payment_intent === "string" ? s.payment_intent : s.payment_intent?.id ?? s.id;
        const { error } = await db.from("payments").upsert(
          {
            owner_id: s.metadata.owner_id,
            invoice_id: inv.id,
            amount_cents: s.amount_total ?? 0,
            method: "card",
            stripe_payment_intent: pi,
          },
          { onConflict: "stripe_payment_intent", ignoreDuplicates: true },
        );
        if (error) {
          console.error(error);
          return new Response("db error", { status: 500 }); // Stripe will retry
        }
      }
    }
  }

  if (event.type === "account.updated" && event.account) {
    const a = event.data.object as Stripe.Account;
    await db.from("business").update({ stripe_connected: Boolean(a.charges_enabled) }).eq("stripe_account_id", event.account);
  }

  return new Response("ok");
});
