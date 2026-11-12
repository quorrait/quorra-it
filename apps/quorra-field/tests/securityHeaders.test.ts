import assert from "node:assert/strict";
import { test } from "node:test";
import { applySecurityHeaders, isAppPath, shouldNoindex } from "../../../scripts/quorradispatch-worker.js";
import { missingCheckoutSession } from "../supabase/functions/_shared/stripeError.ts";

function headersFor(path: string) {
  const response = applySecurityHeaders(new Response("ok", { status: 200, headers: { "Content-Type": "text/html" } }), path);
  return response.headers;
}

test("the app and the test copy get the CSP, and the landing page does not", () => {
  for (const path of ["/app/", "/app/jobs", "/app/quote", "/test/", "/test/billing"]) {
    assert.equal(isAppPath(path), true);
    const headers = headersFor(path);
    const csp = headers.get("Content-Security-Policy") ?? "";
    assert.match(csp, /https:\/\/static\.cloudflareinsights\.com/);
    assert.match(csp, /https:\/\/cloudflareinsights\.com/);
    assert.match(csp, /frame-ancestors 'none'/);
    assert.equal(headers.get("X-Frame-Options"), "DENY");
    assert.equal(headers.get("X-Content-Type-Options"), "nosniff");
    assert.match(headers.get("Strict-Transport-Security") ?? "", /max-age=31536000/);
    assert.equal(headers.get("Referrer-Policy"), "strict-origin-when-cross-origin");
    assert.match(headers.get("Permissions-Policy") ?? "", /camera=\(\)/);
  }

  for (const path of ["/", "/privacy/", "/media/poster.jpg"]) {
    assert.equal(isAppPath(path), false);
    const headers = headersFor(path);
    assert.equal(headers.get("Content-Security-Policy"), null);
    assert.equal(headers.get("X-Frame-Options"), null);
    assert.equal(headers.get("X-Content-Type-Options"), "nosniff");
    assert.match(headers.get("Strict-Transport-Security") ?? "", /includeSubDomains/);
  }
});

test("noindex covers /app and pages.dev, and leaves /test and the public site alone", () => {
  assert.equal(shouldNoindex("/app/", "https://quorradispatch.com/app/"), true);
  assert.equal(shouldNoindex("/app/plans", "https://quorradispatch.com/app/plans"), true);
  assert.equal(shouldNoindex("/app", "https://quorradispatch.com/app"), true);
  assert.equal(headersFor("/app/").get("X-Robots-Tag"), "noindex");

  assert.equal(shouldNoindex("/", "https://quorradispatch.pages.dev/"), true);
  assert.equal(shouldNoindex("/jobber-alternative/", "https://abc123.quorradispatch.pages.dev/jobber-alternative/"), true);
  assert.equal(shouldNoindex("/test/", "https://quorradispatch.pages.dev/test/"), true);

  assert.equal(shouldNoindex("/test/", "https://quorradispatch.com/test/"), false);
  assert.equal(shouldNoindex("/", "https://quorradispatch.com/"), false);
  assert.equal(shouldNoindex("/privacy/", "https://www.quorradispatch.com/privacy/"), false);
  assert.equal(headersFor("/test/").get("X-Robots-Tag"), null);
  assert.equal(headersFor("/").get("X-Robots-Tag"), null);
});

test("an unknown checkout session is the Stripe missing-resource error", () => {
  assert.equal(missingCheckoutSession({ code: "resource_missing", message: "No such checkout.session: cs_missing" }), true);
  assert.equal(missingCheckoutSession({ message: "No such checkout.session: cs_missing" }), true);
  assert.equal(missingCheckoutSession({ raw: { code: "resource_missing", message: "No such checkout.session" } }), true);
  assert.equal(missingCheckoutSession({ code: "card_declined", message: "Your card was declined." }), false);
  assert.equal(missingCheckoutSession(new Error("network down")), false);
});
