// Stripe Connect webhook. Deploy with --no-verify-jwt (Stripe calls it, not a signed-in user).
// Connected accounts endpoint (keep this): checkout.session.completed,
// checkout.session.async_payment_succeeded, payment_intent.succeeded, account.updated.
// account.updated still fires for v1 and v2 accounts on the Connected accounts scope.
// v2 card-payment capability changes also fire
// v2.core.account[configuration.merchant].capability_status_updated on a separate
// "Your account" endpoint. Point that endpoint here and set STRIPE_CONNECT_V2_WEBHOOK_SECRET
// to its signing secret. Checkout and Tap to Pay both land here.
import Stripe from "https://esm.sh/stripe@16.12.0?target=denonext";
import { cardPaymentsActive, retrieveV2CardPayments, V2_CARD_PAYMENTS_EVENT } from "../_shared/connectAccount.ts";
import { admin, env } from "../_shared/util.ts";
import { sendEmail } from "../_shared/notify.ts";
import { notifyAccount } from "../_shared/alert.ts";
import { emailHtml } from "../_shared/emailTemplate.ts";
import { getStyle } from "../_shared/templates.ts";

const stripe = new Stripe(env("STRIPE_SECRET_KEY"), { httpClient: Stripe.createFetchHttpClient() });
const cryptoProvider = Stripe.createSubtleCryptoProvider();

type IncomingEvent = Stripe.Event & { related_object?: { id?: string } };

async function readEvent(body: string, sig: string): Promise<IncomingEvent> {
  const secrets = [env("STRIPE_WEBHOOK_SECRET")];
  const v2Secret = Deno.env.get("STRIPE_CONNECT_V2_WEBHOOK_SECRET");
  if (v2Secret) secrets.push(v2Secret);
  let last: unknown;
  for (const secret of secrets) {
    try {
      return await stripe.webhooks.constructEventAsync(body, sig, secret, undefined, cryptoProvider) as IncomingEvent;
    } catch (e) {
      last = e;
    }
  }
  throw last;
}

/**
 * v1 charges_enabled, or the v2 card_payments capability.
 * Null means the v2 lookup failed and there is no v1 snapshot, so leave the stored flag alone.
 */
async function cardsActive(accountId: string, snapshot?: Stripe.Account): Promise<boolean | null> {
  if (snapshot && cardPaymentsActive(snapshot)) return true;
  const v2 = await retrieveV2CardPayments(env("STRIPE_SECRET_KEY"), accountId);
  if (v2 === "retry") throw new Error("stripe v2 account status");
  if (v2 === "active") return true;
  if (snapshot) return cardPaymentsActive(snapshot);
  if (v2 === "inactive") return false;
  return null;
}

Deno.serve(async (req) => {
  const sig = req.headers.get("stripe-signature");
  if (!sig) return new Response("missing signature", { status: 400 });
  const body = await req.text();

  let event: IncomingEvent;
  try {
    event = await readEvent(body, sig);
  } catch (e) {
    console.error("bad signature", e);
    return new Response("invalid signature", { status: 400 });
  }

  const db = admin();

  async function recordCardPayment(ownerId: string, invoiceId: string, amountCents: number, paymentIntentId: string, receiptEmail?: string | null) {
    const { data: biz } = await db.from("business").select("stripe_account_id").eq("owner_id", ownerId).maybeSingle();
    const { data: inv } = await db.from("invoices").select("id,customer_id,number").eq("id", invoiceId).eq("owner_id", ownerId).maybeSingle();
    if (!inv || !biz?.stripe_account_id || biz.stripe_account_id !== event.account) return false;
    const { data: inserted, error } = await db.from("payments").upsert(
      {
        owner_id: ownerId,
        invoice_id: inv.id,
        amount_cents: amountCents,
        method: "card",
        stripe_payment_intent: paymentIntentId,
      },
      { onConflict: "stripe_payment_intent", ignoreDuplicates: true },
    ).select("id");
    if (error) {
      console.error(error);
      throw new Error("db error");
    }
    const created = Array.isArray(inserted) ? inserted.length > 0 : Boolean(inserted);
    if (created) {
      try {
        const [{ data: b2 }, { data: cust }] = await Promise.all([
          db.from("business").select("name,phone,email,email_templates").eq("owner_id", ownerId).maybeSingle(),
          db.from("customers").select("name,email").eq("id", inv.customer_id).maybeSingle(),
        ]);
        const amt = `$${(amountCents / 100).toFixed(2)}`;
        try {
          await notifyAccount(db, ownerId, {
            title: `Paid: invoice #${inv.number ?? ""} – ${amt}`,
            body: `${cust?.name ?? "A customer"} paid ${amt}.`,
            link: `/invoices/${inv.id}`,
          });
        } catch (e) { console.error("payment notice", e); }
        const to = cust?.email || receiptEmail || "";
        if (to) {
          const first = (cust?.name ?? "").split(" ")[0] || "there";
          const brand = b2?.name || "Your contractor";
          await sendEmail({
            to, replyTo: b2?.email || undefined, fromName: brand, subject: `Payment received: ${amt}`, text: `Hi ${first}, we received your payment of ${amt}. Thank you! ${brand}`,
            html: emailHtml({ brand, style: getStyle(b2?.email_templates), heading: "Thank you for your payment", paragraphs: [`Hi ${first}, we received your payment. Thank you for choosing ${brand}.`],
              rows: [{ label: "Amount paid", value: amt }, { label: "Invoice", value: `#${inv.number ?? ""}` }, { label: "Date", value: new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) }],
              fine: b2?.phone ? `Questions about your bill? Call ${b2.phone} or reply to this email.` : "Questions about your bill? Reply to this email." }),
          });
        }
      } catch (e) { console.error("receipt email", e); }
    }
    return true;
  }

  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    const s = event.data.object as Stripe.Checkout.Session;
    if (s.payment_status === "paid" && s.metadata?.invoice_id && s.metadata?.owner_id) {
      const pi = typeof s.payment_intent === "string" ? s.payment_intent : s.payment_intent?.id ?? s.id;
      try {
        await recordCardPayment(s.metadata.owner_id, s.metadata.invoice_id, s.amount_total ?? 0, pi, s.customer_details?.email);
      } catch {
        return new Response("db error", { status: 500 });
      }
    }
  }

  // Tap to Pay never opens Checkout, so the connected-account PaymentIntent is what marks the invoice paid.
  if (event.type === "payment_intent.succeeded") {
    const pi = event.data.object as Stripe.PaymentIntent;
    if (pi.metadata?.invoice_id && pi.metadata?.owner_id) {
      try {
        await recordCardPayment(pi.metadata.owner_id, pi.metadata.invoice_id, pi.amount_received || pi.amount, pi.id, pi.receipt_email);
      } catch {
        return new Response("db error", { status: 500 });
      }
    }
  }

  try {
    if (event.type === "account.updated" && event.account) {
      const a = event.data.object as Stripe.Account;
      const on = await cardsActive(event.account, a);
      if (on !== null) {
        const { error } = await db.from("business").update({ stripe_connected: on }).eq("stripe_account_id", event.account);
        if (error) throw error;
      }
    }
    if (event.type === V2_CARD_PAYMENTS_EVENT) {
      const accountId = event.related_object?.id || event.account;
      if (accountId) {
        const on = await cardsActive(accountId);
        if (on !== null) {
          const { error } = await db.from("business").update({ stripe_connected: on }).eq("stripe_account_id", accountId);
          if (error) throw error;
        }
      }
    }
  } catch (e) {
    console.error("account status", e);
    return new Response("error", { status: 500 });
  }

  return new Response("ok");
});
