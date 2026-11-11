// Starts (or resumes) Stripe onboarding for a contractor. Uses Standard connected accounts:
// they own their Stripe account, payouts and disputes; funds never sit with us.
import Stripe from "https://esm.sh/stripe@16.12.0?target=denonext";
import { admin, appUrl, env, handler, json, requireUser, billingOwner } from "../_shared/util.ts";

handler(async (req) => {
  const user = await requireUser(req);
  const ownerId = await billingOwner(user.id, ["Owner", "Manager"]);
  const db = admin();
  const stripe = new Stripe(env("STRIPE_SECRET_KEY"), { httpClient: Stripe.createFetchHttpClient() });

  const { data: biz } = await db.from("business").select("name, email, stripe_account_id").eq("owner_id", ownerId).maybeSingle();
  let account = biz?.stripe_account_id as string | null | undefined;

  if (!account) {
    const created = await stripe.accounts.create({
      type: "standard",
      email: biz?.email || user.email || undefined,
      business_profile: { name: biz?.name || undefined },
    });
    account = created.id;
    await db.from("business").update({ stripe_account_id: account }).eq("owner_id", ownerId);
  } else {
    const a = await stripe.accounts.retrieve(account);
    if (a.charges_enabled) {
      await db.from("business").update({ stripe_connected: true }).eq("owner_id", ownerId);
      return json({ url: `${appUrl()}/settings?stripe=done` });
    }
  }

  const link = await stripe.accountLinks.create({
    account,
    type: "account_onboarding",
    refresh_url: `${appUrl()}/settings?stripe=retry`,
    return_url: `${appUrl()}/settings?stripe=done`,
  });
  return json({ url: link.url });
});
