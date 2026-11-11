import assert from "node:assert/strict";
import { test } from "node:test";
import { allowedApi, allowedAppUrl, API_BASE, passwordError } from "../src/lib/safeUrl.ts";

const app = "https://quorradispatch.com/app";

test("return addresses must stay on the app", () => {
  assert.equal(allowedAppUrl("https://quorradispatch.com/app", app), true);
  assert.equal(allowedAppUrl("https://quorradispatch.com/app/portal.html?t=abc", app), true);
  assert.equal(allowedAppUrl("https://quorradispatch.com/app/../evil", app), false);
  assert.equal(allowedAppUrl("https://quorradispatch.com/evil", app), false);
  assert.equal(allowedAppUrl("https://evil.example/app", app), false);
  assert.equal(allowedAppUrl("javascript:alert(1)", app), false);
});

test("only the fixed functions host is an allowed API", () => {
  assert.equal(allowedApi(API_BASE), true);
  assert.equal(allowedApi(`${API_BASE}/portal-pay`), true);
  assert.equal(allowedApi("https://evil.example/functions/v1"), false);
  assert.equal(allowedApi("https://vlwsrrbofnnatctezsmn.supabase.co.evil.com/functions/v1"), false);
});

test("passwords must be at least 8 characters", () => {
  assert.equal(passwordError("short"), "Password must be at least 8 characters.");
  assert.equal(passwordError("12345678"), null);
});
