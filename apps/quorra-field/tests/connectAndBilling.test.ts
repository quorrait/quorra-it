import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  cardPaymentsActive,
  messageFromStripeBody,
  standardConnectedAccountBody,
  standardStyleMismatch,
  V2_CARD_PAYMENTS_EVENT,
} from "../supabase/functions/_shared/connectAccount.ts";
import {
  authUserIsMissing,
  isGoneAccountWrite,
  promoFailureDetail,
  promoFixPatch,
  retryOnce,
  subscriptionDeletedIsDone,
} from "../supabase/functions/_shared/promoRecovery.ts";
import { stripeFailure } from "../supabase/functions/_shared/stripeError.ts";

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
