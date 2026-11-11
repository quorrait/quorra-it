import assert from "node:assert/strict";
import { test } from "node:test";
import { decayed, freshAttempt, lockMessage, onFailure, type AttemptState } from "../supabase/functions/_shared/loginLock.ts";

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

function fail(row: AttemptState, at: number) {
  return onFailure(row, at);
}

test("three wrong passwords lock for 15 minutes, then an hour, then a day", () => {
  const t0 = Date.parse("2026-11-11T12:00:00Z");
  let row = freshAttempt();
  row = fail(row, t0).state;
  row = fail(row, t0 + 1).state;
  const first = fail(row, t0 + 2);
  assert.equal(first.locked, true);
  assert.equal(first.state.lock_count, 1);
  assert.equal(new Date(first.state.locked_until!).getTime() - (t0 + 2), 15 * MIN);
  assert.equal(lockMessage(first.state.locked_until!, t0 + 2), "Too many failed attempts. Try again in 15 minutes or reset your password.");
  assert.equal(lockMessage(first.state.locked_until!, t0 + 2 + 10 * MIN), "Too many failed attempts. Try again in 5 minutes or reset your password.");

  const after = t0 + 2 + 16 * MIN;
  row = first.state;
  row = fail(row, after).state;
  row = fail(row, after + 1).state;
  const second = fail(row, after + 2);
  assert.equal(second.state.lock_count, 2);
  assert.equal(new Date(second.state.locked_until!).getTime() - (after + 2), HOUR);
  assert.equal(lockMessage(second.state.locked_until!, after + 2), "Too many failed attempts. Try again in 1 hour or reset your password.");
  assert.equal(lockMessage(second.state.locked_until!, after + 2 + 30 * MIN), "Too many failed attempts. Try again in 30 minutes or reset your password.");

  const afterHour = after + 2 + HOUR + MIN;
  row = second.state;
  row = fail(row, afterHour).state;
  row = fail(row, afterHour + 1).state;
  const third = fail(row, afterHour + 2);
  assert.equal(third.state.lock_count, 3);
  assert.equal(new Date(third.state.locked_until!).getTime() - (afterHour + 2), DAY);
  assert.equal(lockMessage(third.state.locked_until!, afterHour + 2), "Too many failed attempts. Try again in 24 hours or reset your password.");

  const unlocked = afterHour + 2 + DAY + 1000;
  assert.equal(decayed(third.state, unlocked).lock_count, 3);
  row = third.state;
  row = fail(row, unlocked).state;
  row = fail(row, unlocked + 1).state;
  const fourth = fail(row, unlocked + 2);
  assert.equal(fourth.state.lock_count, 4);
  assert.equal(new Date(fourth.state.locked_until!).getTime() - (unlocked + 2), DAY);
});

test("a day with no failures drops the lock back to 15 minutes", () => {
  const t0 = Date.parse("2026-11-11T12:00:00Z");
  let row = freshAttempt();
  row = fail(row, t0).state;
  row = fail(row, t0 + 1).state;
  row = fail(row, t0 + 2).state;
  const quiet = t0 + 2 + 15 * MIN + DAY + 1000;
  const reset = decayed(row, quiet);
  assert.equal(reset.lock_count, 0);
  assert.equal(reset.fail_count, 0);
  row = fail(reset, quiet).state;
  row = fail(row, quiet + 1).state;
  const again = fail(row, quiet + 2);
  assert.equal(again.state.lock_count, 1);
  assert.equal(new Date(again.state.locked_until!).getTime() - (quiet + 2), 15 * MIN);
});

test("the message uses hours when more than an hour is left", () => {
  const until = new Date(Date.parse("2026-11-11T15:00:00Z")).toISOString();
  const now = Date.parse("2026-11-11T13:30:00Z");
  assert.equal(lockMessage(until, now), "Too many failed attempts. Try again in 1 hour and 30 minutes or reset your password.");
  assert.equal(lockMessage(until, Date.parse("2026-11-11T14:59:30Z")), "Too many failed attempts. Try again in 1 minute or reset your password.");
});
