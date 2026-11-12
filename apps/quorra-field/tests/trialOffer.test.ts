import assert from "node:assert/strict";
import { test } from "node:test";
import {
  monthlyPromoCoupon,
  prorationForPlanChange,
  PROMO_MONTHS,
  shouldGrantTrial,
  stripeSchedulePhases,
  trialPromoPhases,
} from "../supabase/functions/_shared/trialOffer.ts";

const open = { emailSeen: false, cardSeen: false, customerSeen: false, priorSubscription: false, trialUsed: false };

test("a second trial is refused for the same email, card, customer, or earlier subscription", () => {
  assert.equal(shouldGrantTrial(open), true);
  assert.equal(shouldGrantTrial({ ...open, emailSeen: true }), false);
  assert.equal(shouldGrantTrial({ ...open, cardSeen: true }), false);
  assert.equal(shouldGrantTrial({ ...open, customerSeen: true }), false);
  assert.equal(shouldGrantTrial({ ...open, priorSubscription: true }), false);
  assert.equal(shouldGrantTrial({ ...open, trialUsed: true }), false);
});

test("monthly trial promo starts after the trial and keeps the same end date", () => {
  const trialEnd = 1_800_000_000;
  const phases = trialPromoPhases({ priceId: "price_m", interval: "month", trialEnd, promoCoupon: "DISPATCH_LAUNCH_50_3MO" });
  assert.equal(phases.length, 3);
  assert.equal(phases[0].trialEndsAt, trialEnd);
  assert.equal(phases[0].coupon, null);
  assert.equal(phases[1].iterations, PROMO_MONTHS);
  assert.equal(phases[1].coupon, "DISPATCH_LAUNCH_50_3MO");
  assert.equal(phases[1].trialEndsAt, undefined);
  assert.equal(phases[2].coupon, null);
  assert.equal(phases[2].iterations, undefined);

  const stripe = stripeSchedulePhases(phases, 1_700_000_000);
  assert.equal(stripe[0].start_date, 1_700_000_000);
  assert.equal(stripe[0].end_date, trialEnd);
  assert.equal(stripe[0].trial_end, trialEnd);
  assert.equal(stripe[0].proration_behavior, "none");
  assert.equal(stripe[0].discounts, "");
  assert.deepEqual(stripe[1].discounts, [{ coupon: "DISPATCH_LAUNCH_50_3MO" }]);
  assert.equal(stripe[1].iterations, 3);
  assert.equal(stripe[2].discounts, "");
});

test("annual trial uses the discounted annual price and no monthly coupon", () => {
  const phases = trialPromoPhases({ priceId: "price_y", interval: "year", trialEnd: 50, promoCoupon: "DISPATCH_LAUNCH_50_3MO" });
  assert.equal(phases.length, 2);
  assert.equal(phases[0].trialEndsAt, 50);
  assert.equal(phases[1].coupon, null);
  assert.equal(phases[1].iterations, undefined);
  assert.equal(monthlyPromoCoupon("year", "DISPATCH_LAUNCH_50_3MO"), "");
  assert.equal(monthlyPromoCoupon("month", "  COUPON  "), "COUPON");
  assert.equal(monthlyPromoCoupon("month", ""), "");
});

test("a plan change during a trial never invoices, including an upgrade", () => {
  assert.equal(prorationForPlanChange("trialing", true), "none");
  assert.equal(prorationForPlanChange("trialing", false), "none");
  assert.equal(prorationForPlanChange("active", true), "always_invoice");
  assert.equal(prorationForPlanChange("active", false), "schedule");
  assert.equal(prorationForPlanChange("past_due", true), "always_invoice");
});
