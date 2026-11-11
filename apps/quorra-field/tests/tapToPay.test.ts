import assert from "node:assert/strict";
import { test } from "node:test";
import { tapToPayMessage, tapToPayOffer, TAP_TO_PAY_IOS_ENABLED } from "../src/lib/tapToPay.ts";
import { parseUsAddress } from "../src/lib/usAddress.ts";

test("Tap to Pay is offered only on native Android, and iOS stays off until the flag flips", () => {
  assert.equal(TAP_TO_PAY_IOS_ENABLED, false);
  assert.equal(tapToPayOffer("web", false), "hidden");
  assert.equal(tapToPayOffer("web", true), "hidden");
  assert.equal(tapToPayOffer("android", true), "ready");
  assert.equal(tapToPayOffer("ios", true), "soon");
  assert.equal(tapToPayOffer("android", false), "hidden");
});

test("Tap to Pay errors are plain language", () => {
  assert.equal(tapToPayMessage("User canceled the payment"), "Tap to Pay was canceled.");
  assert.equal(tapToPayMessage("NFC is disabled"), "Turn on NFC in your phone settings, then try again.");
  assert.equal(tapToPayMessage("Device does not support Tap to Pay"), "This phone can't take Tap to Pay.");
  assert.equal(tapToPayMessage("Bluetooth is disabled"), "Turn on Bluetooth, then try again.");
  assert.equal(tapToPayMessage(""), "Tap to Pay didn't go through. Try again, or use the QR code.");
});

test("a street, city, state, and ZIP is the address Tap to Pay can store", () => {
  assert.deepEqual(parseUsAddress("123 Main St, Roseville, CA 95678"), {
    line1: "123 Main St", city: "Roseville", state: "CA", postal_code: "95678", country: "US",
  });
  assert.equal(parseUsAddress("Roseville"), null);
  assert.equal(parseUsAddress(""), null);
});
