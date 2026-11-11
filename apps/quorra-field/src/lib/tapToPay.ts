import { Capacitor } from "@capacitor/core";

/**
 * iOS Tap to Pay stays off until the build sets VITE_TAP_TO_PAY_IOS=1.
 * That happens only after Apple enables the proximity-reader entitlement.
 */
export function tapToPayIosEnabled(flag = import.meta.env?.VITE_TAP_TO_PAY_IOS): boolean {
  return flag === "1";
}

export type TapToPayOffer = "hidden" | "soon" | "ready";

/** Web never offers Tap to Pay. Android does. iOS waits on the build flag. */
export function tapToPayOffer(platform = Capacitor.getPlatform(), native = Capacitor.isNativePlatform(), iosEnabled = tapToPayIosEnabled()): TapToPayOffer {
  if (!native || platform === "web") return "hidden";
  if (platform === "ios") return iosEnabled ? "ready" : "soon";
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
  if (/location|settings/.test(m)) return "Allow location in Settings, then try again.";
  if (/not supported|unsupported|incompatible|doesn't support|does not support|no reader/.test(m)) return "This phone can't take Tap to Pay.";
  if (/demo/.test(m)) return raw!.trim();
  return raw!.trim();
}
