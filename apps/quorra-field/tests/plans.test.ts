import assert from "node:assert/strict";
import { test } from "node:test";
import { downgradeLoginMessage, normalizePlanId, planAllows, PLAN_FEATURES, PLAN_SEATS, resolvePlanId, seatLimit } from "../src/lib/plans.ts";

test("an unknown or legacy plan is Basic and is not unlimited", () => {
  for (const name of ["Quorra Dispatch", "", null, "price_123", "Gold"]) {
    assert.equal(normalizePlanId(name), "basic");
  }
  assert.equal(seatLimit("basic"), 1);
  assert.equal(planAllows("basic", "booking"), false);
  assert.equal(planAllows("basic", "qbo"), false);
});

test("named plans and Stripe price ids map to the same three plans", () => {
  assert.equal(normalizePlanId("Essentials"), "essentials");
  assert.equal(normalizePlanId("ENTERPRISE"), "enterprise");
  const priceIds = { basic: ["price_basic"], essentials: ["price_ess"], enterprise: ["price_ent", "price_ent_year"] };
  assert.equal(normalizePlanId("price_ent_year", { priceIds }), "enterprise");
  assert.equal(normalizePlanId("price_unknown", { priceIds }), "basic");
});

test("a trial keeps the plan that was picked", () => {
  assert.equal(normalizePlanId("Essentials"), "essentials");
  assert.equal(planAllows("essentials", "timesheets"), true);
  assert.equal(planAllows("essentials", "reminders"), true);
  assert.equal(planAllows("essentials", "qbo"), false);
  assert.equal(planAllows("essentials", "booking_rules"), false);
});

test("comped, staff, and the sample demo are Enterprise", () => {
  assert.equal(normalizePlanId("Quorra Dispatch", { comped: true }), "enterprise");
  assert.equal(normalizePlanId("basic", { staff: true }), "enterprise");
  assert.equal(resolvePlanId("basic", { demo: true }), "enterprise");
  assert.equal(seatLimit("enterprise"), PLAN_SEATS.enterprise);
  assert.equal(PLAN_FEATURES.enterprise.includes("qbo"), true);
  assert.equal(PLAN_FEATURES.enterprise.includes("booking"), true);
});

test("downgrade is blocked with the login sentence", () => {
  assert.equal(downgradeLoginMessage(6, "basic"), "You have 6 logins; Basic allows 1. Deactivate 5 to switch.");
  assert.equal(downgradeLoginMessage(6, "essentials"), "You have 6 logins; Essentials allows 5. Deactivate 1 to switch.");
  assert.equal(downgradeLoginMessage(6, "enterprise"), null);
  assert.equal(downgradeLoginMessage(1, "basic"), null);
});
