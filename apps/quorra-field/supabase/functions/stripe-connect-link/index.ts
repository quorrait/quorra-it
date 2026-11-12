// Starts (or resumes) Stripe onboarding for a contractor.
// New accounts are Accounts v2, set up like a Standard account: the contractor
// gets the full Stripe Dashboard, Stripe collects fees and covers losses, and
// card payments are requested. Card payments are direct charges on that account
// (portal-pay and create-checkout), with no application fee.
// An account id already stored (including a v1 Standard account connected
// before this change) is reused. charges_enabled still means "ready" for those.
// An id Stripe can no longer retrieve (deleted, or this key cannot access it)
// is dropped and a new account is created.
import Stripe from "https://esm.sh/stripe@16.12.0?target=denonext";
import { businessStripeAccountUpdate, createStandardConnectedAccount, cardPaymentsActive, connectIdempotencyKey, retrieveV2CardPayments, StripeCallError } from "../_shared/connectAccount.ts";
import { clientStripeMessage, staleConnectedAccount, STRIPE_ACCOUNT_CLIENT_MESSAGE, stripeFailure } from "../_shared/stripeError.ts";
import { admin, appUrl, assertBilling, env, handler, HttpError, json, requireUser, billingOwner } from "../_shared/util.ts";

handler(async (req) => {
  try {
    return await connect(req);
  } catch (e) {
    if (e instanceof HttpError) throw e;
    // The browser gets a safe message. The log keeps Stripe's own error.
    if (e instanceof StripeCallError) {
      console.error(e);
      throw new HttpError(e.status, clientStripeMessage(e.message));
    }
    const failure = stripeFailure(e);
    if (failure) {
      console.error(e);
      throw new HttpError(failure.status, failure.message);
    }
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
  let replacedAccount: string | null = null;

  if (account) {
    try {
      if (await acceptingCards(secret, stripe, account)) {
        await db.from("business").update({ stripe_connected: true }).eq("owner_id", ownerId);
        return json({ url: `${appUrl()}/settings?stripe=done` });
      }
    } catch (e) {
      if (!staleConnectedAccount(e)) throw e;
      console.error("stored stripe account is missing or not accessible", account, e);
      replacedAccount = account;
      account = null;
    }
  }

  if (!account) {
    const created = await createStandardConnectedAccount(secret, {
      email: biz?.email || user.email || undefined,
      name: biz?.name || undefined,
      idempotencyKey: connectIdempotencyKey(ownerId, replacedAccount),
    });
    account = created.id;
    if (replacedAccount && account === replacedAccount) {
      console.error("stripe create returned the stale account", account);
      throw new HttpError(502, STRIPE_ACCOUNT_CLIENT_MESSAGE);
    }
    const { error } = await db.from("business").update(businessStripeAccountUpdate(account, replacedAccount !== null)).eq("owner_id", ownerId);
    if (error) throw error;
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
