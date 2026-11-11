// Step 2 of signup: the card was verified, so now create the login, the business and the 14-day trial. Public (Verify JWT OFF).
// Secrets: STRIPE_SECRET_KEY, STRIPE_PRICE_* , optional STRIPE_AUTOMATIC_TAX.
import Stripe from "https://esm.sh/stripe@16.12.0?target=denonext";
import { admin, env, handler, HttpError, json } from "../_shared/util.ts";
import { passwordError } from "../_shared/safeUrl.ts";
import { sendEmail } from "../_shared/notify.ts";
import { emailHtml } from "../_shared/emailTemplate.ts";
import { PUBLIC_APP_URL } from "../_shared/publicUrl.ts";
import { clientIp, rateLimit } from "../_shared/limit.ts";

function planName(id?: string, fallback?: string): string {
  for (const [key, name] of [["BASIC", "Basic"], ["ESSENTIALS", "Essentials"], ["ENTERPRISE", "Enterprise"]]) {
    if (id && (id === Deno.env.get(`STRIPE_PRICE_${key}`) || id === Deno.env.get(`STRIPE_PRICE_${key}_ANNUAL`))) return name;
  }
  const picked = (fallback ?? "").toLowerCase();
  if (picked === "basic" || picked === "essentials" || picked === "enterprise") return picked.charAt(0).toUpperCase() + picked.slice(1);
  return "Basic";
}

const CONFIRM_REDIRECT = `${PUBLIC_APP_URL}/`;

async function mailConfirmation(to: string, link: string) {
  return sendEmail({
    to,
    subject: "Confirm your Quorra Dispatch email",
    text: `Confirm your email to sign in to Quorra Dispatch:\n\n${link}\n\nYour 14-day trial is already set up. If you did not create this account, you can ignore this email.`,
    html: emailHtml({
      heading: "Confirm your email",
      preheader: "Confirm your email to sign in. Your trial is ready.",
      paragraphs: ["Your 14-day trial is already set up. Confirm your email, then sign in with the password you chose."],
      button: { label: "Confirm my email", url: link },
      fine: "If you did not create this account, you can ignore this email.",
    }),
  });
}

handler(async (req) => {
  const b = await req.json().catch(() => ({}));
  const email = String(b.email ?? "").trim().toLowerCase();
  if (b.resend === true) {
    await rateLimit("signup-resend", clientIp(req), 5, 60 * 60);
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      const db = admin();
      const { data, error } = await db.auth.admin.generateLink({ type: "magiclink", email, options: { redirectTo: CONFIRM_REDIRECT } });
      const link = data?.properties?.action_link;
      if (!error && link) await mailConfirmation(email, link);
    }
    return json({ ok: true });
  }
  const password = String(b.password ?? "");
  const pw = passwordError(password);
  if (pw) throw new HttpError(400, pw);
  const stripe = new Stripe(env("STRIPE_SECRET_KEY"), { httpClient: Stripe.createFetchHttpClient() });
  const s = await stripe.checkout.sessions.retrieve(String(b.session_id), { expand: ["setup_intent"] });
  if (s.status !== "complete" || s.metadata?.signup !== "1" || s.metadata?.email !== email) throw new HttpError(403, "The card step was not completed.");
  const si = s.setup_intent as Stripe.SetupIntent | null;
  const pmRaw = si?.payment_method;
  if (si?.status !== "succeeded" || !pmRaw) throw new HttpError(400, "Your card could not be verified. Please try another card.");
  const pm = typeof pmRaw === "string" ? await stripe.paymentMethods.retrieve(pmRaw) : pmRaw;
  const customer = String(s.customer);
  const db = admin();

  // One checkout can create one account.
  const { data: used } = await db.from("subscriptions").select("owner_id").eq("stripe_customer_id", customer).maybeSingle();
  if (used) throw new HttpError(409, "This signup was already completed. Sign in instead.");

  // createUser does not send mail. generateLink both creates the unconfirmed login and returns the link we email ourselves.
  const { data: linked, error: cErr } = await db.auth.admin.generateLink({
    type: "signup",
    email,
    password,
    options: { data: { business_name: s.metadata?.business ?? "", name: s.metadata?.name ?? "" }, redirectTo: CONFIRM_REDIRECT },
  });
  const confirmLink = linked?.properties?.action_link;
  if (cErr || !linked?.user || !confirmLink) throw new HttpError(409, /already/i.test(cErr?.message ?? "") ? "That email already has a login. Sign in instead." : (cErr?.message ?? "Could not create the account"));
  const ownerId = linked.user.id;

  await stripe.customers.update(customer, {
    metadata: { owner_id: ownerId },
    invoice_settings: { default_payment_method: pm.id },
    ...(pm.billing_details?.address?.country ? { address: pm.billing_details.address as Stripe.AddressParam } : {}),
  });
  const plan = s.metadata?.plan ?? "essentials";
  const yearly = s.metadata?.interval === "year";
  const priceId = env(`STRIPE_PRICE_${plan.toUpperCase()}${yearly ? "_ANNUAL" : ""}`);
  // Monthly only. The coupon already exists in Stripe (STRIPE_PROMO_COUPON). Leave the secret empty to turn the offer off. Never create coupons here. Annual prices already include 10% off.
  const promo = yearly ? "" : (Deno.env.get("STRIPE_PROMO_COUPON") ?? "").trim();
  const params = { customer, items: [{ price: priceId, quantity: 1 }], trial_period_days: 14, default_payment_method: pm.id, metadata: { owner_id: ownerId }, ...(promo ? { discounts: [{ coupon: promo }] } : {}) };
  let sub: Stripe.Subscription;
  try {
    sub = await stripe.subscriptions.create(Deno.env.get("STRIPE_AUTOMATIC_TAX") === "true" ? { ...params, automatic_tax: { enabled: true } } : params);
  } catch {
    sub = await stripe.subscriptions.create(params); // tax could not be worked out from the address; still start the trial
  }
  const item = sub.items.data[0];
  await db.from("subscriptions").upsert({
    owner_id: ownerId, status: "active", plan: planName(item?.price?.id, plan), amount_cents: item?.price?.unit_amount ?? 30000,
    billing_interval: item?.price?.recurring?.interval ?? "month", trialing: true,
    current_period_end: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
    cancel_at_period_end: false, stripe_customer_id: customer, stripe_subscription_id: sub.id, updated_at: new Date().toISOString(),
  }, { onConflict: "owner_id" });
  // The trial exists even if the email provider is down. The sign-in page can send the link again.
  const mailed = await mailConfirmation(email, confirmLink);
  if (!mailed.sent) console.error("confirm email", mailed.reason);
  return json({ ok: true, needs_confirm: true, email_sent: mailed.sent });
});
