// Opens Stripe's customer portal: update card, see receipts, change plan, cancel.
// Secrets: STRIPE_SECRET_KEY, APP_URL. Configure the portal once in the Stripe dashboard (Settings > Billing > Customer portal).
import Stripe from "https://esm.sh/stripe@16.12.0?target=denonext";
import { accountOwner, admin, appUrl, env, handler, HttpError, json, requireUser } from "../_shared/util.ts";

handler(async (req) => {
  const user = await requireUser(req);
  if ((await accountOwner(user.id)) !== user.id) throw new HttpError(403, "Only the account owner can manage billing");
  const { flow } = await req.json().catch(() => ({ flow: undefined }));

  const { data: sub } = await admin().from("subscriptions").select("stripe_customer_id, stripe_subscription_id").eq("owner_id", user.id).maybeSingle();
  if (!sub?.stripe_customer_id) throw new HttpError(400, "No subscription yet. Subscribe first.");

  const stripe = new Stripe(env("STRIPE_SECRET_KEY"), { httpClient: Stripe.createFetchHttpClient() });
  const params: Stripe.BillingPortal.SessionCreateParams = { customer: sub.stripe_customer_id, return_url: `${appUrl()}/billing` };
  if (sub.stripe_subscription_id && flow === "cancel") params.flow_data = { type: "subscription_cancel", subscription_cancel: { subscription: sub.stripe_subscription_id }, after_completion: { type: "redirect", redirect: { return_url: `${appUrl()}/billing?canceled=1` } } };
  if (sub.stripe_subscription_id && flow === "update") params.flow_data = { type: "subscription_update", subscription_update: { subscription: sub.stripe_subscription_id } };
  const session = await stripe.billingPortal.sessions.create(params);
  return json({ url: session.url });
});
