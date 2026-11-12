// Starts (or resumes) Stripe onboarding for a contractor.
// New accounts are Accounts v2, set up like a Standard account: the contractor
// gets the full Stripe Dashboard, Stripe collects fees and covers losses, and
// card payments are requested. Card payments are direct charges on that account
// (portal-pay and create-checkout), with no application fee.
// An account id already stored (including a v1 Standard account connected
// before this change) is reused. charges_enabled still means "ready" for those.
import Stripe from "https://esm.sh/stripe@16.12.0?target=denonext";
import { createStandardConnectedAccount, cardPaymentsActive, retrieveV2CardPayments, StripeCallError } from "../_shared/connectAccount.ts";
import { stripeFailure } from "../_shared/stripeError.ts";
import { admin, appUrl, assertBilling, env, handler, HttpError, json, requireUser, billingOwner } from "../_shared/util.ts";

handler(async (req) => {
  try {
    return await connect(req);
  } catch (e) {
    if (e instanceof HttpError) throw e;
    if (e instanceof StripeCallError) throw new HttpError(e.status, e.message);
    const failure = stripeFailure(e);
    if (failure) throw new HttpError(failure.status, failure.message);
    throw e;
  }
});

async function connect(req: Request): Promise<Response> {
  const user = await requireUser(req);
  const ownerId = await billingOwner(user.id, ["Owner", "Manager"]);
  await assertBilling(ownerId);
  const db = admin();
  const secret = env("STRIPE_SECRET_KEY");
  const stripe = new Stripe(secret, { httpClient: Stripe.createFetchHttpClient() });

  const { data: biz } = await db.from("business").select("name, email, stripe_account_id").eq("owner_id", ownerId).maybeSingle();
  let account = biz?.stripe_account_id as string | null | undefined;

  if (!account) {
    const created = await createStandardConnectedAccount(secret, {
      email: biz?.email || user.email || undefined,
      name: biz?.name || undefined,
      idempotencyKey: `connect-${ownerId}`,
    });
    account = created.id;
    const { error } = await db.from("business").update({ stripe_account_id: account }).eq("owner_id", ownerId);
    if (error) throw error;
  } else if (await acceptingCards(secret, stripe, account)) {
    await db.from("business").update({ stripe_connected: true }).eq("owner_id", ownerId);
    return json({ url: `${appUrl()}/settings?stripe=done` });
  }

  const link = await stripe.accountLinks.create({
    account,
    type: "account_onboarding",
    refresh_url: `${appUrl()}/settings?stripe=retry`,
    return_url: `${appUrl()}/settings?stripe=done`,
  });
  return json({ url: link.url });
}

/** v1 charges_enabled covers accounts already connected in production. v2 uses card_payments. */
async function acceptingCards(secret: string, stripe: Stripe, accountId: string): Promise<boolean> {
  const current = await stripe.accounts.retrieve(accountId);
  if (cardPaymentsActive(current)) return true;
  const v2 = await retrieveV2CardPayments(secret, accountId);
  if (v2 === "retry") throw new StripeCallError(502, "Stripe could not check the connected account. Please try again.");
  return v2 === "active";
}
