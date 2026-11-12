/** One automatic retry, then a durable flag the Hub can show. */

export async function retryOnce<T>(run: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: unknown }> {
  try {
    return { ok: true, value: await run() };
  } catch {
    try {
      return { ok: true, value: await run() };
    } catch (error) {
      return { ok: false, error };
    }
  }
}

export function promoFailureDetail(error: unknown): string {
  const message = error && typeof error === "object"
    ? String((error as { raw?: { message?: string }; message?: string }).raw?.message
      || (error as { message?: string }).message
      || "The promo schedule could not be saved.")
    : "The promo schedule could not be saved.";
  return message.replace(/\s+/g, " ").trim().slice(0, 500);
}

/** Columns written on subscriptions. Null means "leave the existing flag alone". */
export function promoFixPatch(fix: { needed: boolean; detail: string } | null): { promo_fix_needed: boolean; promo_fix_detail: string | null } | null {
  if (!fix) return null;
  if (!fix.needed) return { promo_fix_needed: false, promo_fix_detail: null };
  return { promo_fix_needed: true, promo_fix_detail: fix.detail || "The launch promo could not be applied." };
}

/**
 * customer.subscription.deleted after delete-account.
 * The auth user is removed first and the business row cascades with it, so the
 * subscription upsert hits a foreign key and Stripe would retry for days.
 * A missing login is finished. A missing business is finished when the
 * subscription row is already gone too. A login that still exists keeps the
 * update: the business row is created on first sign-in, and a cancel still
 * has to be stored.
 */
export function subscriptionDeletedIsDone(input: {
  userMissing: boolean;
  businessMissing: boolean;
  subscriptionPresent: boolean;
}): boolean {
  if (input.userMissing) return true;
  if (input.businessMissing && !input.subscriptionPresent) return true;
  return false;
}

/** Postgres foreign-key failure: the owner row is already gone. Retrying will not succeed. */
export function isGoneAccountWrite(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { code?: string; message?: string };
  if (e.code === "23503") return true;
  return /foreign key|not present in table/i.test(e.message ?? "");
}

export function authUserIsMissing(error: { status?: number; message?: string; code?: string } | null | undefined): boolean {
  if (!error) return false;
  if (error.status === 404) return true;
  return /not found|does not exist/i.test(`${error.message ?? ""} ${error.code ?? ""}`);
}
