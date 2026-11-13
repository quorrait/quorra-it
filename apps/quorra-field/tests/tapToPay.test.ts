import assert from "node:assert/strict";
import { test } from "node:test";
import { iosSupportsTapToPay, iosVersionFromUserAgent, tapToPayBlocker, tapToPayMessage, tapToPayOffer } from "../src/lib/tapToPay.ts";
import { parseUsAddress } from "../src/lib/usAddress.ts";

test("Tap to Pay is offered on the native iOS and Android apps", () => {
  assert.equal(tapToPayOffer("web", false), "hidden");
  assert.equal(tapToPayOffer("web", true), "hidden");
  assert.equal(tapToPayOffer("android", true), "ready");
  assert.equal(tapToPayOffer("ios", true), "ready");
  assert.equal(tapToPayOffer("android", false), "hidden");
  assert.equal(tapToPayOffer("ios", false), "hidden");
});

test("Tap to Pay errors are plain language", () => {
  assert.equal(tapToPayMessage("User canceled the payment"), "Tap to Pay was canceled.");
  assert.equal(tapToPayMessage("NFC is disabled"), "Turn on NFC in your phone settings, then try again.");
  assert.equal(tapToPayMessage("Device does not support Tap to Pay"), "This phone can't take Tap to Pay.");
  assert.equal(tapToPayMessage("Bluetooth is disabled"), "Turn on Bluetooth, then try again.");
  assert.equal(tapToPayMessage(""), "Tap to Pay didn't go through. Try again, or use the QR code.");
});

test("iOS 16.4 or later can offer Tap to Pay, and a missing Stripe address cannot", () => {
  assert.equal(iosSupportsTapToPay(iosVersionFromUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X)")), false);
  assert.equal(iosSupportsTapToPay(iosVersionFromUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 16_4 like Mac OS X)")), true);
  assert.equal(iosSupportsTapToPay(iosVersionFromUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X)")), true);
  assert.equal(iosVersionFromUserAgent("Mozilla/5.0 (Linux; Android 16)"), null);
  assert.equal(tapToPayBlocker({ stripeConnected: false, address: "123 Main St, Roseville, CA 95678" }), "Connect Stripe before taking Tap to Pay.");
  assert.match(tapToPayBlocker({ stripeConnected: true, address: "Roseville" }) ?? "", /street, city, state, and ZIP/);
  assert.equal(tapToPayBlocker({ stripeConnected: true, address: "123 Main St, Roseville, CA 95678" }), null);
});

test("a street, city, state, and ZIP is the address Tap to Pay can store", () => {
  assert.deepEqual(parseUsAddress("123 Main St, Roseville, CA 95678"), {
    line1: "123 Main St", city: "Roseville", state: "CA", postal_code: "95678", country: "US",
  });
  assert.equal(parseUsAddress("Roseville"), null);
  assert.equal(parseUsAddress(""), null);
});
