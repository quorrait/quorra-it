/** Pure trial and launch-promo rules. Signup, plan changes, and the unit tests all use this file. */

/** Months of 50% off after the trial, when the customer is paying monthly. */
export const PROMO_MONTHS = 3;

export function normalizeTrialEmail(email: string): string {
  return email.trim().toLowerCase();
}

export interface TrialHistory {
  emailSeen: boolean;
  cardSeen: boolean;
  customerSeen: boolean;
  priorSubscription: boolean;
  trialUsed: boolean;
}

/**
 * One 14-day trial per email, card, Stripe customer, or earlier subscription.
 * Any one of those is enough to skip the trial and bill the plan they pick.
 */
export function shouldGrantTrial(history: TrialHistory): boolean {
  return !history.emailSeen
    && !history.cardSeen
    && !history.customerSeen
    && !history.priorSubscription
    && !history.trialUsed;
}

/** Annual prices already include 10% off. The coupon secret is monthly only. */
export function monthlyPromoCoupon(interval: "month" | "year", secret: string | undefined): string {
  if (interval !== "month") return "";
  return (secret ?? "").trim();
}

export interface TrialPhase {
  priceId: string;
  /** When set, the whole phase is a free trial that ends at this unix time. */
  trialEndsAt?: number;
  /** Billing cycles this phase lasts. The last phase omits it and runs on. */
  iterations?: number;
  /** Null clears a coupon inherited from the customer or the previous phase. */
  coupon: string | null;
}

/**
 * Schedule for a subscription that is still on its free trial.
 * The trial end passed in is kept as-is: plan changes do not move it and do not charge.
 * Monthly: trial, then PROMO_MONTHS at the launch coupon, then full price.
 * Annual: trial, then the annual price (the 10% is already in that price).
 */
export function trialPromoPhases(input: {
  priceId: string;
  interval: "month" | "year";
  trialEnd: number;
  promoCoupon: string;
}): TrialPhase[] {
  const trial: TrialPhase = { priceId: input.priceId, trialEndsAt: input.trialEnd, coupon: null };
  const full: TrialPhase = { priceId: input.priceId, coupon: null };
  const coupon = monthlyPromoCoupon(input.interval, input.promoCoupon);
  if (coupon) {
    return [trial, { priceId: input.priceId, iterations: PROMO_MONTHS, coupon }, full];
  }
  return [trial, full];
}

/** Stripe schedule phases. The first phase keeps startDate so the trial clock does not restart. */
export function stripeSchedulePhases(phases: TrialPhase[], startDate: number): Array<Record<string, unknown>> {
  return phases.map((phase, index) => {
    const body: Record<string, unknown> = {
      items: [{ price: phase.priceId, quantity: 1 }],
      proration_behavior: "none",
      discounts: phase.coupon ? [{ coupon: phase.coupon }] : "",
    };
    if (index === 0) body.start_date = startDate;
    if (phase.trialEndsAt != null) {
      body.end_date = phase.trialEndsAt;
      body.trial_end = phase.trialEndsAt;
    }
    if (phase.iterations != null) body.iterations = phase.iterations;
    return body;
  });
}

/**
 * A trial is never invoiced, even when the new plan costs more.
 * always_invoice is only for an upgrade after the customer is actually paying.
 */
export function prorationForPlanChange(status: string, upgrade: boolean): "none" | "always_invoice" | "schedule" {
  if (status === "trialing") return "none";
  if (upgrade) return "always_invoice";
  return "schedule";
}
