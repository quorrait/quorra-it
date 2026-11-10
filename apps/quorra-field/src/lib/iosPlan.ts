import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser";

/** Public pricing page. Checkout stays on the website, not inside the iOS app. */
export const BUY_URL = "https://www.quorrait.com/dispatch/#pricing";

export function isIosApp(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";
}

/**
 * True when this iPhone should show a link to buy on the website.
 * StoreKit's storefront is not available without a native plugin, so this uses the
 * device locale region (for example en-US). A language with no region is not treated as the US.
 */
export function isUsStorefront(): boolean {
  const tags = [navigator.language, ...(navigator.languages ?? [])];
  for (const tag of tags) {
    if (!tag) continue;
    try {
      const region = new Intl.Locale(tag).region;
      if (region) return region.toUpperCase() === "US";
    } catch { /* try the next tag */ }
    const part = tag.split("-")[1];
    if (part && /^[A-Za-z]{2}$/.test(part)) return part.toUpperCase() === "US";
  }
  return false;
}

export async function openBuyPage(): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    await Browser.open({ url: BUY_URL });
    return;
  }
  window.open(BUY_URL, "_blank", "noopener");
}
