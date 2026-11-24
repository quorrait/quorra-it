import { Capacitor } from "@capacitor/core";

/**
 * True only in the native iOS app.
 * Capacitor.getPlatform() is "ios" there, "android" in the Android app, and "web" in the browser.
 */
export function isIOSNative(platform: string = Capacitor.getPlatform()): boolean {
  return platform === "ios";
}

/** Shown instead of pricing, trials, upgrades, or a link to buy on the web. */
export const IOS_ACCOUNT_ATTENTION = "Your account needs attention. Contact your account administrator.";

const SIGNUP_PATHS = new Set(["start", "signup", "plans"]);

/** Business registration and plan selection. Staff invite (/join) is not one of these. */
export function isIosBlockedSignupPath(path: string): boolean {
  const bare = path.replace(/^#/, "").split("?")[0].replace(/\/+$/, "");
  const first = bare.split("/").filter(Boolean)[0] ?? "";
  return SIGNUP_PATHS.has(first);
}

export function iosAccountState(input: { locked?: boolean; status?: string | null; phase?: string | null }): "active" | "attention" {
  if (input.locked) return "attention";
  if (input.phase === "grace" || input.phase === "reviewer" || input.phase === "lapsed" || input.phase === "closed") return "attention";
  if ((input.status ?? "none") === "active") return "active";
  return "attention";
}

export function iosAccountCopy(state: "active" | "attention"): string {
  return state === "active" ? "Your account is active." : IOS_ACCOUNT_ATTENTION;
}
