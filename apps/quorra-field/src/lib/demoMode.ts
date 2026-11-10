const FLAG = "qd-demo";
const PREVIEW = "qd-plan-preview";

/**
 * Sample-data demo for this browser tab. `?demo=1` turns it on and remembers it
 * until the tab closes or the visitor exits. Evaluated once, before the Supabase
 * client is created, so a demo visit cannot read or write a real account.
 */
export function demoRequested(): boolean {
  try {
    const q = new URLSearchParams(window.location.search).get("demo");
    if (q === "1") {
      sessionStorage.setItem(FLAG, "1");
      return true;
    }
    if (q === "0") {
      sessionStorage.removeItem(FLAG);
      return false;
    }
    return sessionStorage.getItem(FLAG) === "1";
  } catch {
    return false;
  }
}

/** Demo-only plan preview so the sample company can show a locked screen. Ignored on a real account. */
export function demoPlanPreview(): "basic" | "essentials" | "enterprise" | null {
  if (!demoRequested()) return null;
  try {
    const v = sessionStorage.getItem(PREVIEW);
    if (v === "basic" || v === "essentials" || v === "enterprise") return v;
  } catch { /* ignore */ }
  return null;
}

function appPath(path: string): string {
  if (import.meta.env.VITE_HASH_ROUTER) return path;
  const base = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
  return `${base}${path}`;
}

/** Leave the demo and open the real plan picker. Reloads so Supabase can be used again. */
export function leaveDemoForTrial(): void {
  try { sessionStorage.removeItem(FLAG); } catch { /* ignore */ }
  if (import.meta.env.VITE_HASH_ROUTER) {
    location.hash = "#/plans";
    location.reload();
    return;
  }
  location.assign(appPath("/plans"));
}

/** Leave the demo and return to sign-in. Does not sign out a real account. */
export function exitDemo(): void {
  try { sessionStorage.removeItem(FLAG); } catch { /* ignore */ }
  if (import.meta.env.VITE_HASH_ROUTER) {
    location.hash = "#/";
    location.reload();
    return;
  }
  location.assign(appPath("/"));
}
