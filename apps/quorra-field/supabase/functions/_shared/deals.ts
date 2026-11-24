/**
 * Partner signup deals. One code maps to a plan, a trial length, and the Stripe
 * price ids. The browser may send the code. It never chooses a price id.
 * An unknown code is not a deal: signup and plan changes use the normal prices.
 * A deal does not stack with the launch coupon, and it is not a complimentary account.
 * This file imports nothing so the start page and the edge functions can share it.
 */

export const STANDARD_TRIAL_DAYS = 14;

export type DealPlan = "basic" | "essentials" | "enterprise";
export type Interval = "month" | "year";

export interface PartnerDeal {
  code: string;
  plan: DealPlan;
  trialDays: number;
  prices: Record<Interval, string>;
  /** Shown on the start page. Stripe charges the price id, not this number. */
  amountCents: Record<Interval, number>;
}

const DEALS: Readonly<Record<string, PartnerDeal>> = {
  "matt60-k7p2": {
    code: "matt60-k7p2",
    plan: "essentials",
    trialDays: 60,
    prices: {
      month: "price_1Uf6RDPiJsvybzTqVhnROTWw",
      year: "price_1Uf6REPiJsvybzTqSKdzShmw",
    },
    amountCents: { month: 9500, year: 114_000 },
  },
};

const PLAN_LABEL: Record<DealPlan, string> = { basic: "Basic", essentials: "Essentials", enterprise: "Enterprise" };

/** Same rule as monthlyPromoCoupon in trialOffer.ts. Annual prices are not couponed. */
function launchCoupon(interval: Interval, secret: string | undefined): string {
  if (interval !== "month") return "";
  return (secret ?? "").trim();
}

/** Known code, or null. Blank and unknown codes use the normal flow. */
export function lookupDeal(code: string | null | undefined): PartnerDeal | null {
  const key = (code ?? "").trim();
  if (!key) return null;
  return DEALS[key] ?? null;
}

function dealByPriceId(priceId: string): PartnerDeal | null {
  for (const deal of Object.values(DEALS)) {
    if (deal.prices.month === priceId || deal.prices.year === priceId) return deal;
  }
  return null;
}

export function dealOfferLabel(deal: PartnerDeal, interval: Interval): string {
  const amount = deal.amountCents[interval] / 100;
  const shown = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: Number.isInteger(amount) ? 0 : 2,
  }).format(amount);
  return `${deal.trialDays}-day free trial, then ${shown}/${interval === "year" ? "yr" : "mo"}`;
}

/** What signup-checkout stores. A valid deal locks the plan. An unknown plan without a deal is rejected. */
export function signupSessionFields(input: { plan?: unknown; interval?: unknown; deal?: unknown }): {
  plan: string;
  interval: Interval;
  deal: string | null;
  accepted: boolean;
} {
  const deal = lookupDeal(typeof input.deal === "string" ? input.deal : "");
  const interval: Interval = input.interval === "year" ? "year" : "month";
  if (deal) return { plan: deal.plan, interval, deal: deal.code, accepted: true };
  const plan = String(input.plan ?? "essentials").toLowerCase();
  const accepted = plan === "basic" || plan === "essentials" || plan === "enterprise";
  return { plan, interval, deal: null, accepted };
}

export interface CheckoutTerms {
  priceId: string;
  /** Zero means this signup does not get a trial. */
  trialDays: number;
  /** Empty means no launch coupon and no promo_schedule. */
  promoCoupon: string;
  dealCode: string | null;
}

/** Prices and the trial come from the deal code on the Checkout Session, not from the browser. */
export function checkoutTerms(input: {
  dealCode: string | null | undefined;
  interval: Interval;
  standardPriceId: string;
  promoSecret: string | undefined;
  grantTrial: boolean;
}): CheckoutTerms {
  const deal = lookupDeal(input.dealCode);
  if (deal) {
    return {
      priceId: deal.prices[input.interval],
      trialDays: input.grantTrial ? deal.trialDays : 0,
      promoCoupon: "",
      dealCode: deal.code,
    };
  }
  return {
    priceId: input.standardPriceId,
    trialDays: input.grantTrial ? STANDARD_TRIAL_DAYS : 0,
    promoCoupon: launchCoupon(input.interval, input.promoSecret),
    dealCode: null,
  };
}

export function subscriptionMetadata(ownerId: string, terms: CheckoutTerms): Record<string, string> {
  return {
    owner_id: ownerId,
    ...(terms.dealCode ? { deal: terms.dealCode } : {}),
    ...(terms.trialDays > 0 && terms.promoCoupon ? { promo_schedule: "pending" } : {}),
  };
}

/** Coupon on the subscription itself. A trial must not carry one. A deal never does. */
export function subscriptionDiscounts(terms: CheckoutTerms): Array<{ coupon: string }> | null {
  if (terms.trialDays === 0 && terms.promoCoupon) return [{ coupon: terms.promoCoupon }];
  return null;
}

export interface PlanChangePrice {
  priceId: string;
  keepDeal: boolean;
  dealCode: string | null;
  /** Passed to a trial plan change. Empty skips the launch coupon. */
  promoCoupon: string;
}

/**
 * Staying on the deal plan keeps the deal prices and skips the launch coupon.
 * Any other plan drops the deal and uses the standard price.
 */
export function planChangePrice(input: {
  dealCode: string | null | undefined;
  targetPlan: string;
  interval: Interval;
  standardPriceId: string;
  promoSecret: string | undefined;
}): PlanChangePrice {
  const deal = lookupDeal(input.dealCode);
  if (deal && input.targetPlan === deal.plan) {
    return { priceId: deal.prices[input.interval], keepDeal: true, dealCode: deal.code, promoCoupon: "" };
  }
  return {
    priceId: input.standardPriceId,
    keepDeal: false,
    dealCode: null,
    promoCoupon: launchCoupon(input.interval, input.promoSecret),
  };
}

/** Stripe deletes a metadata key when the value is empty. */
export function dealMetadataPatch(keepDeal: boolean, dealCode: string | null, existingDeal: string | null | undefined): Record<string, string> | null {
  if (keepDeal) {
    if (!dealCode || existingDeal === dealCode) return null;
    return { deal: dealCode };
  }
  if (!existingDeal) return null;
  return { deal: "" };
}

/** Annual prices already include their discount. A deal never keeps the launch coupon. */
export function dropLaunchPromo(keepDeal: boolean, interval: Interval): boolean {
  return keepDeal || interval === "year";
}

/** Deal prices are Essentials even when the Stripe nickname is empty or wrong. */
export function planNameForPrice(priceId: string | null | undefined, opts?: {
  envPrice?: (name: string) => string | undefined;
  nickname?: string | null;
  fallbackPlan?: string | null;
}): string {
  if (priceId) {
    const deal = dealByPriceId(priceId);
    if (deal) return PLAN_LABEL[deal.plan];
  }
  const envPrice = opts?.envPrice;
  if (priceId && envPrice) {
    for (const key of ["BASIC", "ESSENTIALS", "ENTERPRISE"] as const) {
      if (priceId === envPrice(`STRIPE_PRICE_${key}`) || priceId === envPrice(`STRIPE_PRICE_${key}_ANNUAL`)) return PLAN_LABEL[key.toLowerCase() as DealPlan];
    }
  }
  const nick = (opts?.nickname ?? "").trim().toLowerCase();
  if (nick === "basic" || nick === "essentials" || nick === "enterprise") return PLAN_LABEL[nick];
  const fallback = (opts?.fallbackPlan ?? "").trim().toLowerCase();
  if (fallback === "basic" || fallback === "essentials" || fallback === "enterprise") return PLAN_LABEL[fallback];
  return "Basic";
}

/** A deal subscription must not receive the launch coupon, even if promo_schedule was left pending. */
export function launchPromoForSubscription(dealCode: string | null | undefined, interval: Interval, secret: string | undefined): string {
  if (lookupDeal(dealCode)) return "";
  return launchCoupon(interval, secret);
}

export function confirmationTrialLine(trialDays: number): string {
  if (trialDays > 0) return `Your ${trialDays}-day trial is already set up.`;
  return "Your account is already set up.";
}

/** Missing metadata keeps the historical 14-day sentence. Zero means no trial was granted. */
export function trialDaysFromMetadata(meta: { trial_days?: unknown } | null | undefined): number {
  if (meta == null || meta.trial_days == null || meta.trial_days === "") return STANDARD_TRIAL_DAYS;
  const n = typeof meta.trial_days === "number" ? meta.trial_days : Number(meta.trial_days);
  if (!Number.isFinite(n) || n < 0) return STANDARD_TRIAL_DAYS;
  return Math.trunc(n);
}
