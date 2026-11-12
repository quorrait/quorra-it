import { Capacitor } from "@capacitor/core";
import { parseUsAddress } from "./usAddress";

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

export interface IosVersion {
  major: number;
  minor: number;
}

/** "iPhone OS 16_4" from a WebView user agent. Null when this is not an iPhone. */
export function iosVersionFromUserAgent(ua: string): IosVersion | null {
  const match = ua.match(/(?:iPhone OS|CPU OS|iPad OS)\s+(\d+)[_.](\d+)/);
  if (!match) return null;
  return { major: Number(match[1]), minor: Number(match[2]) };
}

/** Tap to Pay on iPhone needs iOS 16.4 or later. The phone itself must be an iPhone XS or newer. */
export function iosSupportsTapToPay(version: IosVersion | null): boolean {
  if (!version) return false;
  if (version.major > 16) return true;
  return version.major === 16 && version.minor >= 4;
}

/** Shown before the server call, in the same words the server uses for the address. */
export function tapToPayBlocker(input: { stripeConnected?: boolean; address?: string | null }): string | null {
  if (!input.stripeConnected) return "Connect Stripe before taking Tap to Pay.";
  if (!parseUsAddress(input.address)) return "Set your business address in Settings as street, city, state, and ZIP before using Tap to Pay.";
  return null;
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
