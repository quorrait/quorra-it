/** Pure lockout rules. The login function and the unit tests both use this file. */

export const FAILS_TO_LOCK = 3;
export const QUIET_MS = 24 * 60 * 60 * 1000;

export interface AttemptState {
  fail_count: number;
  lock_count: number;
  locked_until: string | null;
  last_failed_at: string | null;
}

export const freshAttempt = (): AttemptState => ({
  fail_count: 0,
  lock_count: 0,
  locked_until: null,
  last_failed_at: null,
});

/** 1st lock 15 minutes, 2nd lock 1 hour, 3rd and later 24 hours. */
export function lockDurationMs(lockCount: number): number {
  if (lockCount <= 1) return 15 * 60 * 1000;
  if (lockCount === 2) return 60 * 60 * 1000;
  return 24 * 60 * 60 * 1000;
}

/**
 * Escalation fades after a full day with no failed attempts.
 * The day starts when the account is allowed to try again (after a lock ends,
 * or at the last failure when it never locked). A 24-hour lock therefore stays
 * at the 24-hour step until another quiet day passes.
 */
export function decayed(row: AttemptState, now: number): AttemptState {
  if (!row.last_failed_at) return row;
  const failedAt = new Date(row.last_failed_at).getTime();
  const lockedUntil = row.locked_until ? new Date(row.locked_until).getTime() : null;
  if (lockedUntil != null && lockedUntil > now) return row;
  const quietFrom = lockedUntil != null && lockedUntil > failedAt ? lockedUntil : failedAt;
  if (now - quietFrom < QUIET_MS) return row;
  return freshAttempt();
}

export function onFailure(row: AttemptState, now: number): { locked: boolean; state: AttemptState } {
  const base = decayed(row, now);
  const failCount = base.fail_count + 1;
  const last_failed_at = new Date(now).toISOString();
  if (failCount < FAILS_TO_LOCK) {
    return { locked: false, state: { ...base, fail_count: failCount, last_failed_at } };
  }
  const lock_count = base.lock_count + 1;
  return {
    locked: true,
    state: {
      fail_count: 0,
      lock_count,
      locked_until: new Date(now + lockDurationMs(lock_count)).toISOString(),
      last_failed_at,
    },
  };
}

export function remainingLabel(ms: number): string {
  const minutes = Math.max(1, Math.ceil(ms / 60000));
  if (minutes < 60) return minutes === 1 ? "1 minute" : `${minutes} minutes`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  const hourLabel = hours === 1 ? "1 hour" : `${hours} hours`;
  if (rem === 0) return hourLabel;
  const minuteLabel = rem === 1 ? "1 minute" : `${rem} minutes`;
  return `${hourLabel} and ${minuteLabel}`;
}

const RESET_WINDOW_MS = 60 * 60 * 1000;

/**
 * A locked email cannot open a new session, except through a password reset
 * or email confirmation link sent in the last hour. The database trigger uses
 * the same window.
 */
export function sessionAllowedWhileLocked(input: {
  lockedUntil: string | null;
  now: number;
  recoverySentAt: string | null;
  confirmationSentAt: string | null;
}): boolean {
  if (!input.lockedUntil || new Date(input.lockedUntil).getTime() <= input.now) return true;
  const recent = (iso: string | null) => iso != null && new Date(iso).getTime() > input.now - RESET_WINDOW_MS;
  return recent(input.recoverySentAt) || recent(input.confirmationSentAt);
}

export function lockMessage(lockedUntil: string, now: number): string {
  const ms = new Date(lockedUntil).getTime() - now;
  return `Too many failed attempts. Try again in ${remainingLabel(ms)} or reset your password.`;
}
