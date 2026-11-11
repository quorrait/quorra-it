export interface DiscountRef { discount?: string; coupon?: string }

/** Phase 2 of a downgrade keeps the current discount ids. Going annual drops the monthly coupon. An empty kept list must not wipe a discount Stripe already copied onto the schedule. */
export function phaseDiscounts(kept: DiscountRef[], carried: DiscountRef[], yearly: boolean): DiscountRef[] {
  if (kept.length) return kept;
  if (yearly) return [];
  return carried;
}
