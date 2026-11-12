export type BillingPhase = "ok" | "grace" | "reviewer" | "closed" | "lapsed";

const DAY = 86400000;

/** Same windows as billing_phase() in 0048_unpaid_lifecycle.sql. Canceled is never reviewer. */
export function billingPhase(sub: { status?: string | null; comped?: boolean | null; past_due_since?: string | null } | null, now = Date.now()): BillingPhase {
  if (!sub) return "lapsed";
  if (sub.comped) return "ok";
  if (sub.status === "active") return "ok";
  if (sub.status !== "past_due") return "lapsed";
  const since = sub.past_due_since ? new Date(sub.past_due_since).getTime() : now;
  const elapsed = now - since;
  if (elapsed < 7 * DAY) return "grace";
  if (elapsed < 37 * DAY) return "reviewer";
  return "closed";
}

export function graceDaysLeft(pastDueSince: string | null, now = Date.now()): number {
  const since = pastDueSince ? new Date(pastDueSince).getTime() : now;
  return Math.max(1, Math.ceil((7 * DAY - (now - since)) / DAY));
}

export function reviewerEndsAt(pastDueSince: string | null, now = Date.now()): Date {
  const since = pastDueSince ? new Date(pastDueSince).getTime() : now;
  return new Date(since + 37 * DAY);
}
