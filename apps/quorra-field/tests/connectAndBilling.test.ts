import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  businessStripeAccountUpdate,
  cardPaymentsActive,
  connectIdempotencyKey,
  messageFromStripeBody,
  standardConnectedAccountBody,
  standardStyleMismatch,
  V2_CARD_PAYMENTS_EVENT,
} from "../supabase/functions/_shared/connectAccount.ts";
import {
  authUserIsMissing,
  isGoneAccountWrite,
  promoFailureDetail,
  promoFixAfterRepeatTrial,
  promoFixPatch,
  REPEAT_TRIAL_PROMO_DETAIL,
  retryOnce,
  subscriptionDeletedIsDone,
} from "../supabase/functions/_shared/promoRecovery.ts";
import { staleConnectedAccount, STRIPE_ACCOUNT_CLIENT_MESSAGE, stripeFailure } from "../supabase/functions/_shared/stripeError.ts";

const v1Rejection = "Stripe no longer recommends Accounts v1 for new Connect integrations. Use the Accounts v2 API instead.";

test("a new contractor account is a full-dashboard v2 account with Stripe fees, Stripe losses, and card payments", () => {
  const body = standardConnectedAccountBody({ email: "ada@example.com", name: "Ada Heating" });
  assert.equal(body.dashboard, "full");
  assert.equal((body.defaults as { responsibilities: { fees_collector: string; losses_collector: string } }).responsibilities.fees_collector, "stripe");
  assert.equal((body.defaults as { responsibilities: { losses_collector: string } }).responsibilities.losses_collector, "stripe");
  const merchant = (body.configuration as { merchant: { capabilities: { card_payments: { requested: boolean } } } }).merchant;
  assert.equal(merchant.capabilities.card_payments.requested, true);
  assert.equal("customer" in (body.configuration as object), false);
  assert.equal("type" in body, false);
  assert.equal(JSON.stringify(body).includes("application_fee"), false);
  assert.equal(JSON.stringify(body).includes("standard"), false);
  assert.equal(standardStyleMismatch({
    id: "acct_123",
    dashboard: "full",
    defaults: { responsibilities: { fees_collector: "stripe", losses_collector: "stripe" } },
    configuration: { merchant: { capabilities: { card_payments: { status: "pending" } } } },
  }), null);
});

test("card payments are active for an existing v1 account or a v2 capability", () => {
  assert.equal(cardPaymentsActive({ charges_enabled: true }), true);
  assert.equal(cardPaymentsActive({ charges_enabled: false, capabilities: { card_payments: "active" } }), true);
  assert.equal(cardPaymentsActive({
    charges_enabled: false,
    configuration: { merchant: { capabilities: { card_payments: { status: "active" } } } },
  }), true);
  assert.equal(cardPaymentsActive({ charges_enabled: false, capabilities: { card_payments: "pending" } }), false);
  assert.equal(cardPaymentsActive(null), false);
  assert.equal(V2_CARD_PAYMENTS_EVENT, "v2.core.account[configuration.merchant].capability_status_updated");
});

test("Stripe's own error is the message the caller sees", () => {
  const sdk = stripeFailure({
    type: "StripeInvalidRequestError",
    statusCode: 400,
    message: v1Rejection,
    raw: { message: v1Rejection },
  });
  assert.equal(sdk?.status, 400);
  assert.equal(sdk?.message, v1Rejection);
  assert.equal(stripeFailure(new Error("database down")), null);
  const api = messageFromStripeBody({ error: { message: v1Rejection } }, 400);
  assert.equal(api.status, 400);
  assert.equal(api.message, v1Rejection);
  assert.equal(messageFromStripeBody({}, 500).status, 502);
  const declined = stripeFailure({
    type: "StripeCardError",
    statusCode: 402,
    message: "Your card was declined.",
    raw: { message: "Your card was declined." },
  });
  assert.equal(declined?.status, 402);
  assert.equal(declined?.message, "Your card was declined.");
});

const keyLeak = "The provided key 'sk_test_*********************************************************************************************abcd' does not have access to account 'acct_123' (or that account does not exist). Application access may have been revoked.";

test("a key fragment or an account-access error is not returned to the browser", () => {
  const denied = stripeFailure({
    type: "StripeInvalidRequestError",
    code: "account_invalid",
    statusCode: 403,
    message: keyLeak,
    raw: { message: keyLeak, code: "account_invalid" },
  });
  assert.equal(denied?.status, 403);
  assert.equal(denied?.message, STRIPE_ACCOUNT_CLIENT_MESSAGE);
  assert.equal(denied?.message.includes("sk_"), false);
  assert.equal(denied?.message.includes("acct_"), false);

  const masked = stripeFailure({
    type: "StripePermissionError",
    statusCode: 403,
    message: "The provided key 'sk_…wxyz' does not have access to account 'acct_live'.",
    raw: { message: "The provided key 'sk_…wxyz' does not have access to account 'acct_live'." },
  });
  assert.equal(masked?.message, STRIPE_ACCOUNT_CLIENT_MESSAGE);

  const missing = stripeFailure({
    type: "StripeInvalidRequestError",
    statusCode: 404,
    message: "No such account: 'acct_123'",
    raw: { code: "resource_missing", message: "No such account: 'acct_123'" },
  });
  assert.equal(missing?.message, STRIPE_ACCOUNT_CLIENT_MESSAGE);
  assert.equal(messageFromStripeBody({ error: { message: keyLeak } }, 403).message, STRIPE_ACCOUNT_CLIENT_MESSAGE);
});

test("a missing or inaccessible connected account is replaced, and the old idempotency key is not reused", () => {
  assert.equal(staleConnectedAccount({ code: "account_invalid", message: keyLeak, raw: { message: keyLeak } }), true);
  assert.equal(staleConnectedAccount({ code: "resource_missing", message: "No such account: 'acct_123'" }), true);
  assert.equal(staleConnectedAccount({ raw: { code: "resource_missing", message: "No such checkout.session: cs_missing" } }), false);
  assert.equal(staleConnectedAccount({ type: "StripeCardError", message: "Your card was declined." }), false);
  assert.equal(staleConnectedAccount(new Error("network down")), false);
  assert.equal(staleConnectedAccount(null), false);

  assert.equal(connectIdempotencyKey("owner-1", null), "connect-owner-1");
  assert.equal(connectIdempotencyKey("owner-1", "acct_old"), "connect-owner-1-replace-acct_old");
  assert.deepEqual(businessStripeAccountUpdate("acct_new", false), { stripe_account_id: "acct_new" });
  assert.deepEqual(businessStripeAccountUpdate("acct_new", true), {
    stripe_account_id: "acct_new",
    stripe_connected: false,
    terminal_location_id: null,
  });
});

test("a repeat trial that ends before the promo is scheduled is flagged and not repriced", () => {
  const open = { wasTrialing: true, promoSchedule: "pending", statusAfter: "active", promoScheduleAfter: "pending", fix: null };
  assert.deepEqual(promoFixAfterRepeatTrial(open), { needed: true, detail: REPEAT_TRIAL_PROMO_DETAIL });
  assert.equal(promoFixAfterRepeatTrial({ ...open, statusAfter: "past_due" })?.detail, REPEAT_TRIAL_PROMO_DETAIL);
  assert.equal(promoFixAfterRepeatTrial({ ...open, wasTrialing: false }), null);
  assert.equal(promoFixAfterRepeatTrial({ ...open, promoSchedule: "ready" }), null);
  assert.equal(promoFixAfterRepeatTrial({ ...open, statusAfter: "trialing" }), null);
  assert.equal(promoFixAfterRepeatTrial({ ...open, promoScheduleAfter: "ready" }), null);
  const stripeFix = { needed: true, detail: "No such coupon: DISPATCH_LAUNCH_50_3MO" };
  assert.deepEqual(promoFixAfterRepeatTrial({ ...open, fix: stripeFix }), stripeFix);
  assert.deepEqual(promoFixAfterRepeatTrial({ ...open, statusAfter: "trialing", fix: { needed: false, detail: "" } }), { needed: false, detail: "" });
  assert.deepEqual(promoFixPatch({ needed: true, detail: REPEAT_TRIAL_PROMO_DETAIL }), {
    promo_fix_needed: true,
    promo_fix_detail: REPEAT_TRIAL_PROMO_DETAIL,
  });
});

test("invoice checkout stays a direct charge on the contractor account with no application fee", () => {
  for (const file of ["portal-pay/index.ts", "create-checkout/index.ts"]) {
    const src = readFileSync(new URL(`../supabase/functions/${file}`, import.meta.url), "utf8");
    assert.match(src, /stripeAccount:\s*biz\.stripe_account_id/);
    assert.equal(src.includes("application_fee"), false);
  }
});

test("the promo schedule is tried a second time, then kept as a Hub flag", async () => {
  let calls = 0;
  const failed = await retryOnce(async () => {
    calls += 1;
    throw Object.assign(new Error("nope"), { raw: { message: "No such coupon: DISPATCH_LAUNCH_50_3MO" } });
  });
  assert.equal(failed.ok, false);
  assert.equal(calls, 2);
  if (!failed.ok) {
    assert.match(promoFailureDetail(failed.error), /DISPATCH_LAUNCH_50_3MO/);
    assert.deepEqual(promoFixPatch({ needed: true, detail: promoFailureDetail(failed.error) }), {
      promo_fix_needed: true,
      promo_fix_detail: "No such coupon: DISPATCH_LAUNCH_50_3MO",
    });
  }
  let second = 0;
  const recovered = await retryOnce(async () => {
    second += 1;
    if (second === 1) throw new Error("once");
    return "ready";
  });
  assert.equal(recovered.ok, true);
  if (recovered.ok) assert.equal(recovered.value, "ready");
  assert.deepEqual(promoFixPatch({ needed: false, detail: "" }), { promo_fix_needed: false, promo_fix_detail: null });
  assert.equal(promoFixPatch(null), null);
});

test("a deleted subscription is finished when the login or the company is already gone", () => {
  assert.equal(subscriptionDeletedIsDone({ userMissing: true, businessMissing: true, subscriptionPresent: false }), true);
  assert.equal(subscriptionDeletedIsDone({ userMissing: true, businessMissing: false, subscriptionPresent: true }), true);
  assert.equal(subscriptionDeletedIsDone({ userMissing: false, businessMissing: true, subscriptionPresent: false }), true);
  assert.equal(subscriptionDeletedIsDone({ userMissing: false, businessMissing: true, subscriptionPresent: true }), false);
  assert.equal(subscriptionDeletedIsDone({ userMissing: false, businessMissing: false, subscriptionPresent: true }), false);
  assert.equal(isGoneAccountWrite({ code: "23503", message: 'insert or update on table "subscriptions" violates foreign key constraint' }), true);
  assert.equal(isGoneAccountWrite({ code: "08006", message: "connection failure" }), false);
  assert.equal(isGoneAccountWrite(new Error("connection failure")), false);
  assert.equal(authUserIsMissing({ status: 404, message: "User not found" }), true);
  assert.equal(authUserIsMissing({ message: "timeout" }), false);
});
