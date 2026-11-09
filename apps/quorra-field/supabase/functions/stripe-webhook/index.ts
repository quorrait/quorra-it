// Stripe Connect webhook. Deploy with --no-verify-jwt (Stripe calls it, not a signed-in user).
// Events to send: checkout.session.completed, checkout.session.async_payment_succeeded, account.updated  ("Events on Connected accounts").
import Stripe from "https://esm.sh/stripe@16.12.0?target=denonext";
import { admin, env } from "../_shared/util.ts";
import { sendEmail } from "../_shared/notify.ts";
import { emailHtml } from "../_shared/emailTemplate.ts";
import { getStyle } from "../_shared/templates.ts";

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
      const { data: inv } = await db.from("invoices").select("id,customer_id,number").eq("id", s.metadata.invoice_id).eq("owner_id", s.metadata.owner_id).maybeSingle();
      if (inv && biz?.stripe_account_id && biz.stripe_account_id === event.account) {
        const pi = typeof s.payment_intent === "string" ? s.payment_intent : s.payment_intent?.id ?? s.id;
        const { data: had } = await db.from("payments").select("id").eq("stripe_payment_intent", pi).maybeSingle();
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
        // Receipt to the customer, from the business (their name, their colors, replies to their email).
        if (!had) {
          try {
            const [{ data: b2 }, { data: cust }] = await Promise.all([
              db.from("business").select("name,phone,email,email_templates").eq("owner_id", s.metadata.owner_id).maybeSingle(),
              db.from("customers").select("name,email").eq("id", inv.customer_id).maybeSingle(),
            ]);
            const to = cust?.email || s.customer_details?.email || "";
            if (to) {
              const amt = `$${((s.amount_total ?? 0) / 100).toFixed(2)}`;
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
      }
    }
  }

  if (event.type === "account.updated" && event.account) {
    const a = event.data.object as Stripe.Account;
    await db.from("business").update({ stripe_connected: Boolean(a.charges_enabled) }).eq("stripe_account_id", event.account);
  }

  return new Response("ok");
});
