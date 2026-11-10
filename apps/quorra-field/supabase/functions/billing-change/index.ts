// Change plan, cancel at period end, or resume, all from inside the app (no Stripe screens). Signed-in owner only (Verify JWT ON).
// Secrets: STRIPE_SECRET_KEY (needs Subscriptions: write), STRIPE_PRICE_<PLAN> and STRIPE_PRICE_<PLAN>_ANNUAL.
import Stripe from "https://esm.sh/stripe@16.12.0?target=denonext";
import { accountOwner, billingOwner, admin, env, handler, HttpError, json, requireUser } from "../_shared/util.ts";

/** Launch coupons that apply to monthly prices only. Annual prices already include 10% off. */
function promoCouponIds(): Set<string> {
  const ids = new Set<string>(["DISPATCH_LAUNCH_50_3MO"]);
  const fromEnv = Deno.env.get("STRIPE_PROMO_COUPON")?.trim();
  if (fromEnv) ids.add(fromEnv);
  return ids;
}

type DiscountRef = { discount?: string; coupon?: string };
type SubWithDiscounts = Stripe.Subscription & {
  discount?: Stripe.Discount | string | null;
  discounts?: Array<Stripe.Discount | string> | null;
};

function couponIdOf(d: Stripe.Discount | string): string | undefined {
  if (typeof d === "string") return undefined;
  const coupon = d.coupon as Stripe.Coupon | string | undefined;
  return typeof coupon === "string" ? coupon : coupon?.id;
}

/** Discounts to send back on a price swap. Reusing the discount id keeps the original window. Never adds a coupon. */
function keptDiscounts(sub: SubWithDiscounts, yearly: boolean): DiscountRef[] {
  const promos = promoCouponIds();
  const raw = [sub.discount, ...(sub.discounts ?? [])].filter((d): d is Stripe.Discount | string => Boolean(d));
  const seen = new Set<string>();
  const kept: DiscountRef[] = [];
  for (const d of raw) {
    const id = typeof d === "string" ? d : d.id;
    const couponId = couponIdOf(d);
    if (yearly && couponId && promos.has(couponId)) continue;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    kept.push({ discount: id });
  }
  return kept;
}

function discountUpdate(sub: Stripe.Subscription, yearly: boolean): { discounts: DiscountRef[] | "" } {
  const discounts = keptDiscounts(sub as SubWithDiscounts, yearly);
  return { discounts: discounts.length ? discounts : "" };
}

async function loadSub(stripe: Stripe, id: string): Promise<Stripe.Subscription> {
  try {
    return await stripe.subscriptions.retrieve(id, { expand: ["discounts"] });
  } catch {
    return await stripe.subscriptions.retrieve(id);
  }
}

handler(async (req) => {
  const user = await requireUser(req);
  const owner = await billingOwner(user.id);
  const b = await req.json().catch(() => ({}));
  const db = admin();
  const { data: sub } = await db.from("subscriptions").select("stripe_subscription_id").eq("owner_id", owner).maybeSingle();
  if (!sub?.stripe_subscription_id) throw new HttpError(400, "No subscription yet. Subscribe first.");
  const stripe = new Stripe(env("STRIPE_SECRET_KEY"), { httpClient: Stripe.createFetchHttpClient() });
  const id = sub.stripe_subscription_id as string;

  if (b.action === "cancel") {
    const c0 = await stripe.subscriptions.retrieve(id);
    if (c0.schedule) await stripe.subscriptionSchedules.release(typeof c0.schedule === "string" ? c0.schedule : c0.schedule.id);
    await stripe.subscriptions.update(id, { cancel_at_period_end: true });
    await db.from("subscriptions").update({ cancel_at_period_end: true }).eq("owner_id", owner);
    return json({ ok: true });
  }
  if (b.action === "resume") {
    const cur = await stripe.subscriptions.retrieve(id);
    // Stripe accepts only one of the two; clear whichever one is set.
    await stripe.subscriptions.update(id, cur.cancel_at ? { cancel_at: "" as unknown as undefined } : { cancel_at_period_end: false });
    await db.from("subscriptions").update({ cancel_at_period_end: false }).eq("owner_id", owner);
    return json({ ok: true });
  }
  if (b.action === "change") {
    const plan = String(b.plan ?? "").toLowerCase();
    if (!["basic", "essentials", "enterprise"].includes(plan)) throw new HttpError(400, "Unknown plan");
    const priceId = env(`STRIPE_PRICE_${plan.toUpperCase()}${b.interval === "year" ? "_ANNUAL" : ""}`);
    let cur = await loadSub(stripe, id);
    // An earlier scheduled downgrade would block a direct change, so drop it first.
    if (cur.schedule) { await stripe.subscriptionSchedules.release(typeof cur.schedule === "string" ? cur.schedule : cur.schedule.id); cur = await loadSub(stripe, id); }
    const item = cur.items.data[0];
    const yearly = (p: Stripe.Price) => (p.unit_amount ?? 0) * (p.recurring?.interval === "year" ? 1 : 12);
    const next = await stripe.prices.retrieve(priceId);
    if (next.id === item.price.id) return json({ ok: true, mode: "same" });
    const toYear = b.interval === "year";
    const trialEnd = cur.trial_end;
    if (cur.status === "trialing" && typeof trialEnd === "number" && trialEnd * 1000 > Date.now()) {
      // Nothing has been paid. Switch the price now, do not invoice, and do not move the trial end.
      // Passing discounts again is required: a price swap otherwise drops them. Annual drops the monthly coupon.
      const discounts = discountUpdate(cur, toYear);
      const updated = await stripe.subscriptions.update(id, {
        items: [{ id: item.id, price: priceId }],
        proration_behavior: "none",
        trial_end: trialEnd,
        cancel_at_period_end: false,
        ...discounts,
      });
      if (updated.trial_end !== trialEnd) {
        await stripe.subscriptions.update(id, { trial_end: trialEnd, proration_behavior: "none", ...discounts });
      }
      return json({ ok: true, mode: "trial_plan_change", trial_end: trialEnd });
    }
    if (yearly(next) > yearly(item.price)) {
      // Paid upgrade: switch now and charge the prorated difference for the rest of the period.
      await stripe.subscriptions.update(id, {
        items: [{ id: item.id, price: priceId }],
        proration_behavior: "always_invoice",
        cancel_at_period_end: false,
        ...discountUpdate(cur, toYear),
      });
      return json({ ok: true, mode: "upgrade" });
    }
    // Downgrade: no refund, the new plan starts at the next billing date. The current phase keeps its discount; an annual phase does not keep the monthly coupon.
    const sch = await stripe.subscriptionSchedules.create({ from_subscription: id });
    const ph = sch.phases[0];
    const onYearNow = item.price.recurring?.interval === "year";
    await stripe.subscriptionSchedules.update(sch.id, {
      end_behavior: "release",
      phases: [
        { items: [{ price: item.price.id, quantity: 1 }], start_date: ph.start_date, end_date: ph.end_date, discounts: keptDiscounts(cur as SubWithDiscounts, onYearNow) },
        { items: [{ price: priceId, quantity: 1 }], discounts: keptDiscounts(cur as SubWithDiscounts, toYear) },
      ],
    });
    return json({ ok: true, mode: "downgrade", effective: ph.end_date });
  }
  throw new HttpError(400, "Unknown action");
});
