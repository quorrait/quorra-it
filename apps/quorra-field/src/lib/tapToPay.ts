import { Capacitor } from "@capacitor/core";

/**
 * Flip this after Apple grants com.apple.developer.proximity-reader.payment.acceptance
 * and that entitlement is on the signed iOS build. Until then iOS shows "coming soon".
 */
export const TAP_TO_PAY_IOS_ENABLED = false;

export type TapToPayOffer = "hidden" | "soon" | "ready";

/** Web never offers Tap to Pay. Android does. iOS waits on the flag above. */
export function tapToPayOffer(platform = Capacitor.getPlatform(), native = Capacitor.isNativePlatform()): TapToPayOffer {
  if (!native || platform === "web") return "hidden";
  if (platform === "ios") return TAP_TO_PAY_IOS_ENABLED ? "ready" : "soon";
  if (platform === "android") return "ready";
  return "hidden";
}

/** Stripe and the phone throw a lot of different sentences. The sheet shows one of these. */
export function tapToPayMessage(raw?: string | null): string {
  const m = (raw ?? "").toLowerCase();
  if (!m) return "Tap to Pay didn't go through. Try again, or use the QR code.";
  if (/cancel/.test(m)) return "Tap to Pay was canceled.";
  if (/nfc/.test(m)) return "Turn on NFC in your phone settings, then try again.";
  if (/bluetooth/.test(m)) return "Turn on Bluetooth, then try again.";
  if (/location/.test(m)) return "Allow location access so Tap to Pay can start, then try again.";
  if (/not supported|unsupported|incompatible|doesn't support|does not support|no reader/.test(m)) return "This phone can't take Tap to Pay.";
  if (/demo/.test(m)) return raw!.trim();
  return raw!.trim();
}
