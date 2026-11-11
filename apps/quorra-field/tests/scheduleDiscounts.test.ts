import assert from "node:assert/strict";
import { test } from "node:test";
import { phaseDiscounts } from "../supabase/functions/_shared/scheduleDiscounts.ts";

test("a downgrade keeps the launch coupon until its original end", () => {
  const kept = [{ discount: "di_launch" }];
  const carried = [{ discount: "di_launch" }];
  assert.deepEqual(phaseDiscounts(kept, carried, false), [{ discount: "di_launch" }]);
  assert.deepEqual(phaseDiscounts([], carried, false), [{ discount: "di_launch" }]);
  assert.deepEqual(phaseDiscounts([], carried, true), []);
});
