import Stripe from "https://esm.sh/stripe@16.12.0?target=denonext";
import { promoFailureDetail, retryOnce } from "./promoRecovery.ts";
import { stripeSchedulePhases, trialPromoPhases, type TrialPhase } from "./trialOffer.ts";

type Phase = Stripe.SubscriptionScheduleUpdateParams.Phase;

/** Another Stripe customer with this email already has a subscription (any status, including canceled). */
export async function emailHasOtherSubscription(stripe: Stripe, email: string, exceptCustomerId: string): Promise<boolean> {
  if (!email) return false;
  const listed = await stripe.customers.list({ email, limit: 100 });
  for (const other of listed.data) {
    if (other.id === exceptCustomerId) continue;
    const subs = await stripe.subscriptions.list({ customer: other.id, status: "all", limit: 1 });
    if (subs.data.length > 0) return true;
  }
  return false;
}

async function scheduleIdFor(stripe: Stripe, sub: Stripe.Subscription): Promise<string> {
  const existing = typeof sub.schedule === "string" ? sub.schedule : sub.schedule?.id;
  if (existing) return existing;
  try {
    const created = await stripe.subscriptionSchedules.create({ from_subscription: sub.id });
    return created.id;
  } catch (e) {
    const again = await stripe.subscriptions.retrieve(sub.id);
    const id = typeof again.schedule === "string" ? again.schedule : again.schedule?.id;
    if (id) return id;
    throw e;
  }
}

async function writePhases(stripe: Stripe, sub: Stripe.Subscription, phases: TrialPhase[], trialEnd: number): Promise<Stripe.Subscription> {
  const scheduleId = await scheduleIdFor(stripe, sub);
  const sch = await stripe.subscriptionSchedules.retrieve(scheduleId);
  const start = sch.phases[0]?.start_date;
  if (typeof start !== "number") return sub;
  await stripe.subscriptionSchedules.update(scheduleId, {
    end_behavior: "release",
    proration_behavior: "none",
    phases: stripeSchedulePhases(phases, start) as Phase[],
  });
  let updated = await stripe.subscriptions.retrieve(sub.id);
  if (updated.trial_end !== trialEnd) {
    updated = await stripe.subscriptions.update(sub.id, { trial_end: trialEnd, proration_behavior: "none" });
  }
  return updated;
}

/** Point a trialing subscription at a new price without charging and without moving the trial end. */
export async function replaceTrialPlan(
  stripe: Stripe,
  sub: Stripe.Subscription,
  priceId: string,
  interval: "month" | "year",
  promoCoupon: string,
): Promise<Stripe.Subscription> {
  const trialEnd = sub.trial_end;
  if (sub.status !== "trialing" || typeof trialEnd !== "number") return sub;
  const updated = await writePhases(stripe, sub, trialPromoPhases({ priceId, interval, trialEnd, promoCoupon }), trialEnd);
  if (updated.metadata?.promo_schedule === "ready") return updated;
  return stripe.subscriptions.update(updated.id, { metadata: { ...updated.metadata, promo_schedule: "ready" } });
}

/**
 * New trials are marked promo_schedule=pending and carry no coupon yet, so the
 * 50% window starts when the trial ends. Subscriptions that are already running
 * are left alone.
 */
export async function ensureTrialPromoSchedule(stripe: Stripe, sub: Stripe.Subscription, promoCoupon: string): Promise<Stripe.Subscription> {
  if (sub.metadata?.promo_schedule !== "pending") return sub;
  if (sub.status !== "trialing" || typeof sub.trial_end !== "number") return sub;
  const price = sub.items.data[0]?.price;
  if (!price?.id) return sub;
  const interval = price.recurring?.interval === "year" ? "year" : "month";
  const updated = await writePhases(
    stripe,
    sub,
    trialPromoPhases({ priceId: price.id, interval, trialEnd: sub.trial_end, promoCoupon }),
    sub.trial_end,
  );
  return stripe.subscriptions.update(updated.id, { metadata: { ...updated.metadata, promo_schedule: "ready" } });
}

export interface PromoFix {
  /** False clears a previous flag after the schedule was saved. */
  needed: boolean;
  detail: string;
}

/**
 * Write the post-trial promo. On failure, try once more. If that also fails,
 * leave promo_schedule pending and return a flag so the Hub can show it.
 * A subscription that is not waiting on the promo is left unchanged.
 */
export async function ensureTrialPromoWithRetry(
  stripe: Stripe,
  sub: Stripe.Subscription,
  promoCoupon: string,
): Promise<{ subscription: Stripe.Subscription; fix: PromoFix | null }> {
  if (sub.metadata?.promo_schedule !== "pending") return { subscription: sub, fix: null };
  if (sub.status !== "trialing" || typeof sub.trial_end !== "number") return { subscription: sub, fix: null };
  const result = await retryOnce(() => ensureTrialPromoSchedule(stripe, sub, promoCoupon));
  if (!result.ok) {
    console.error("trial promo schedule", result.error);
    return { subscription: sub, fix: { needed: true, detail: promoFailureDetail(result.error) } };
  }
  if (result.value.metadata?.promo_schedule === "ready") {
    return { subscription: result.value, fix: { needed: false, detail: "" } };
  }
  return { subscription: result.value, fix: null };
}
