import assert from "node:assert/strict";
import { test } from "node:test";
import { allowedApi, allowedAppUrl, API_BASE, checkoutPaidUrl, passwordError, portalPayReturn } from "../src/lib/safeUrl.ts";
import { checkoutPaidUrl as sharedPaidUrl, portalPayReturn as sharedPortalReturn } from "../supabase/functions/_shared/safeUrl.ts";

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

test("a rejected payment return still opens the customer's portal, and paid=1 stays a valid query", () => {
  const token = "portal token&id=1";
  const fallback = portalPayReturn(undefined, app, token);
  assert.equal(fallback, `${app}/portal.html?t=portal%20token%26id%3D1`);
  assert.equal(portalPayReturn("https://evil.example/portal.html?t=stolen", app, token), fallback);
  assert.equal(portalPayReturn(`${app}/portal.html?t=kept`, app, token), `${app}/portal.html?t=kept`);

  assert.equal(sharedPortalReturn(undefined, app, token), fallback);
  assert.equal(sharedPaidUrl(fallback), checkoutPaidUrl(fallback));

  const success = checkoutPaidUrl(fallback);
  const url = new URL(success);
  assert.equal(`${url.origin}${url.pathname}`, `${app}/portal.html`);
  assert.equal(url.searchParams.get("t"), token);
  assert.equal(url.searchParams.get("paid"), "1");
  assert.equal(checkoutPaidUrl(`${app}/portal.html`), `${app}/portal.html?paid=1`);
  assert.equal(checkoutPaidUrl(`${app}/portal.html?t=kept`), `${app}/portal.html?t=kept&paid=1`);
});

test("passwords must be at least 8 characters", () => {
  assert.equal(passwordError("short"), "Password must be at least 8 characters.");
  assert.equal(passwordError("12345678"), null);
});
