import assert from "node:assert/strict";
import { test } from "node:test";
import {
  checkoutTerms,
  confirmationTrialLine,
  dealMetadataPatch,
  dealOfferLabel,
  dropLaunchPromo,
  launchPromoForSubscription,
  lookupDeal,
  planChangePrice,
  planNameForPrice,
  signupSessionFields,
  STANDARD_TRIAL_DAYS,
  subscriptionDiscounts,
  subscriptionMetadata,
  trialDaysFromMetadata,
} from "../supabase/functions/_shared/deals.ts";
import { monthlyPromoCoupon, prorationForPlanChange } from "../supabase/functions/_shared/trialOffer.ts";
import { browserPathFromHash } from "../src/lib/hashRoute.ts";

const CODE = "matt60-k7p2";
const MONTH = "price_1Uf6RDPiJsvybzTqVhnROTWw";
const YEAR = "price_1Uf6REPiJsvybzTqSKdzShmw";
const STANDARD_MONTH = "price_1UZINIPiJsvybzTqDwkpxGih";
const STANDARD_YEAR = "price_1UZIQgPiJsvybzTqyqoMeE5z";
const PROMO = "DISPATCH_LAUNCH_50_3MO";

test("the partner deal is Essentials, 60 days, and the private prices", () => {
  const deal = lookupDeal(CODE);
  assert.ok(deal);
  assert.equal(deal.plan, "essentials");
  assert.equal(deal.trialDays, 60);
  assert.equal(deal.prices.month, MONTH);
  assert.equal(deal.prices.year, YEAR);
  assert.equal(deal.amountCents.month, 9500);
  assert.equal(deal.amountCents.year, 114_000);
  assert.notEqual(deal.prices.month, STANDARD_MONTH);
  assert.notEqual(deal.prices.year, STANDARD_YEAR);
  assert.equal(dealOfferLabel(deal, "month"), "60-day free trial, then $95/mo");
  assert.equal(dealOfferLabel(deal, "year"), "60-day free trial, then $1,140/yr");
  assert.equal(lookupDeal("  matt60-k7p2  ")?.code, CODE);
  assert.equal(lookupDeal("MATT60-K7P2"), null);
  assert.equal(lookupDeal("matt60"), null);
  assert.equal(lookupDeal(""), null);
  assert.equal(lookupDeal(null), null);
});

test("a valid deal locks Essentials and an unknown code uses the normal plan", () => {
  const locked = signupSessionFields({ plan: "enterprise", interval: "year", deal: CODE });
  assert.deepEqual(locked, { plan: "essentials", interval: "year", deal: CODE, accepted: true });
  const normal = signupSessionFields({ plan: "basic", interval: "month", deal: "not-a-deal" });
  assert.deepEqual(normal, { plan: "basic", interval: "month", deal: null, accepted: true });
  assert.equal(signupSessionFields({ plan: "gold", deal: "" }).accepted, false);
  assert.equal(signupSessionFields({}).plan, "essentials");
});

test("signup uses the deal price and a 60-day trial, with no launch coupon", () => {
  const terms = checkoutTerms({
    dealCode: CODE, interval: "month", standardPriceId: STANDARD_MONTH, promoSecret: PROMO, grantTrial: true,
  });
  assert.equal(terms.priceId, MONTH);
  assert.equal(terms.trialDays, 60);
  assert.equal(terms.promoCoupon, "");
  assert.equal(terms.dealCode, CODE);
  assert.equal(subscriptionDiscounts(terms), null);
  assert.deepEqual(subscriptionMetadata("owner_1", terms), { owner_id: "owner_1", deal: CODE });
  assert.equal("promo_schedule" in subscriptionMetadata("owner_1", terms), false);

  const yearly = checkoutTerms({
    dealCode: CODE, interval: "year", standardPriceId: STANDARD_YEAR, promoSecret: PROMO, grantTrial: true,
  });
  assert.equal(yearly.priceId, YEAR);
  assert.equal(yearly.trialDays, 60);
  assert.equal(yearly.promoCoupon, "");
  assert.equal(confirmationTrialLine(yearly.trialDays), "Your 60-day trial is already set up.");
});

test("a deal does not grant a second trial, and still does not add the launch coupon", () => {
  const terms = checkoutTerms({
    dealCode: CODE, interval: "month", standardPriceId: STANDARD_MONTH, promoSecret: PROMO, grantTrial: false,
  });
  assert.equal(terms.priceId, MONTH);
  assert.equal(terms.trialDays, 0);
  assert.equal(terms.promoCoupon, "");
  assert.equal(terms.dealCode, CODE);
  assert.equal(subscriptionDiscounts(terms), null);
  assert.deepEqual(subscriptionMetadata("owner_1", terms), { owner_id: "owner_1", deal: CODE });
  assert.equal(confirmationTrialLine(0), "Your account is already set up.");
});

test("a normal signup is unchanged: 14 days and the monthly launch coupon", () => {
  const monthly = checkoutTerms({
    dealCode: "nope", interval: "month", standardPriceId: STANDARD_MONTH, promoSecret: `  ${PROMO}  `, grantTrial: true,
  });
  assert.equal(monthly.priceId, STANDARD_MONTH);
  assert.equal(monthly.trialDays, STANDARD_TRIAL_DAYS);
  assert.equal(monthly.promoCoupon, monthlyPromoCoupon("month", `  ${PROMO}  `));
  assert.equal(monthly.dealCode, null);
  assert.deepEqual(subscriptionMetadata("owner_1", monthly), { owner_id: "owner_1", promo_schedule: "pending" });
  assert.equal(subscriptionDiscounts(monthly), null);

  const repeat = checkoutTerms({
    dealCode: null, interval: "month", standardPriceId: STANDARD_MONTH, promoSecret: PROMO, grantTrial: false,
  });
  assert.equal(repeat.trialDays, 0);
  assert.deepEqual(subscriptionDiscounts(repeat), [{ coupon: PROMO }]);
  assert.deepEqual(subscriptionMetadata("owner_1", repeat), { owner_id: "owner_1" });

  const annual = checkoutTerms({
    dealCode: undefined, interval: "year", standardPriceId: STANDARD_YEAR, promoSecret: PROMO, grantTrial: true,
  });
  assert.equal(annual.priceId, STANDARD_YEAR);
  assert.equal(annual.promoCoupon, "");
  assert.equal(confirmationTrialLine(14), "Your 14-day trial is already set up.");
});

test("both deal prices are Essentials", () => {
  const envPrice = (name: string) => name === "STRIPE_PRICE_BASIC" ? MONTH : name === "STRIPE_PRICE_ENTERPRISE" ? YEAR : undefined;
  assert.equal(planNameForPrice(MONTH, { envPrice, nickname: "Basic" }), "Essentials");
  assert.equal(planNameForPrice(YEAR, { envPrice, nickname: "" }), "Essentials");
  assert.equal(planNameForPrice("price_basic", { envPrice: (name) => name === "STRIPE_PRICE_BASIC" ? "price_basic" : undefined }), "Basic");
  assert.equal(planNameForPrice("price_nick", { nickname: "enterprise" }), "Enterprise");
  assert.equal(planNameForPrice("price_unknown", { fallbackPlan: "essentials" }), "Essentials");
  assert.equal(planNameForPrice("price_unknown"), "Basic");
});

test("staying on Essentials keeps the deal price and skips the launch coupon", () => {
  const month = planChangePrice({ dealCode: CODE, targetPlan: "essentials", interval: "month", standardPriceId: STANDARD_MONTH, promoSecret: PROMO });
  assert.equal(month.priceId, MONTH);
  assert.equal(month.keepDeal, true);
  assert.equal(month.promoCoupon, "");
  assert.equal(dropLaunchPromo(month.keepDeal, "month"), true);
  assert.equal(dealMetadataPatch(month.keepDeal, month.dealCode, CODE), null);

  const year = planChangePrice({ dealCode: CODE, targetPlan: "essentials", interval: "year", standardPriceId: STANDARD_YEAR, promoSecret: PROMO });
  assert.equal(year.priceId, YEAR);
  assert.equal(year.keepDeal, true);
  assert.equal(year.promoCoupon, "");
  assert.equal(prorationForPlanChange("trialing", true), "none");
  assert.equal(prorationForPlanChange("trialing", false), "none");
});

test("leaving Essentials drops the deal and uses the standard price", () => {
  const basic = planChangePrice({ dealCode: CODE, targetPlan: "basic", interval: "month", standardPriceId: "price_basic", promoSecret: PROMO });
  assert.equal(basic.priceId, "price_basic");
  assert.equal(basic.keepDeal, false);
  assert.equal(basic.dealCode, null);
  assert.equal(basic.promoCoupon, PROMO);
  assert.deepEqual(dealMetadataPatch(basic.keepDeal, basic.dealCode, CODE), { deal: "" });
  assert.equal(dropLaunchPromo(basic.keepDeal, "month"), false);

  const enterprise = planChangePrice({ dealCode: CODE, targetPlan: "enterprise", interval: "year", standardPriceId: "price_ent_year", promoSecret: PROMO });
  assert.equal(enterprise.priceId, "price_ent_year");
  assert.equal(enterprise.promoCoupon, "");
  assert.equal(dropLaunchPromo(enterprise.keepDeal, "year"), true);
  assert.equal(dealMetadataPatch(false, null, ""), null);
  assert.deepEqual(dealMetadataPatch(true, CODE, undefined), { deal: CODE });
});

test("the billing webhook does not attach the launch coupon to a deal", () => {
  assert.equal(launchPromoForSubscription(CODE, "month", PROMO), "");
  assert.equal(launchPromoForSubscription(CODE, "year", PROMO), "");
  assert.equal(launchPromoForSubscription("nope", "month", PROMO), PROMO);
  assert.equal(launchPromoForSubscription(undefined, "year", PROMO), "");
});

test("resend uses the stored trial length, and a missing value stays 14 days", () => {
  assert.equal(trialDaysFromMetadata(undefined), 14);
  assert.equal(trialDaysFromMetadata({}), 14);
  assert.equal(trialDaysFromMetadata({ trial_days: 0 }), 0);
  assert.equal(trialDaysFromMetadata({ trial_days: 60 }), 60);
  assert.equal(trialDaysFromMetadata({ trial_days: "60" }), 60);
  assert.equal(trialDaysFromMetadata({ trial_days: "nope" }), 14);
});

test("a hash partner link becomes the path the production app routes", () => {
  assert.equal(
    browserPathFromHash("#/start?plan=essentials&interval=month&deal=matt60-k7p2", "/app/"),
    "/app/start?plan=essentials&interval=month&deal=matt60-k7p2",
  );
  assert.equal(
    browserPathFromHash("#/start?plan=essentials&interval=year&deal=matt60-k7p2", "/app"),
    "/app/start?plan=essentials&interval=year&deal=matt60-k7p2",
  );
  assert.equal(browserPathFromHash("", "/app/"), null);
  assert.equal(browserPathFromHash("#section", "/app/"), null);
});
