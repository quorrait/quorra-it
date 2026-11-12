import assert from "node:assert/strict";
import { test } from "node:test";
import { billingPhase, graceDaysLeft } from "../src/lib/billingPhase.ts";

const DAY = 86400000;
const start = Date.parse("2026-11-01T00:00:00Z");

test("a failed payment is grace, then reviewer, and a cancel is never reviewer", () => {
  const due = { status: "past_due", past_due_since: new Date(start).toISOString(), comped: false };
  assert.equal(billingPhase(due, start + 2 * DAY), "grace");
  assert.equal(billingPhase(due, start + 8 * DAY), "reviewer");
  assert.equal(billingPhase(due, start + 36 * DAY), "reviewer");
  assert.equal(billingPhase(due, start + 37 * DAY), "closed");
  assert.equal(billingPhase({ status: "active", cancel_at_period_end: true, comped: false }, start), "ok");
  assert.equal(billingPhase({ status: "canceled", past_due_since: new Date(start).toISOString() }, start + 20 * DAY), "lapsed");
  assert.equal(billingPhase({ status: "past_due", comped: true, past_due_since: new Date(start).toISOString() }, start + 20 * DAY), "ok");
  assert.equal(graceDaysLeft(new Date(start).toISOString(), start + 3 * DAY), 4);
});
