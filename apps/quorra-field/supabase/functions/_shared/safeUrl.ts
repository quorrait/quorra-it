/** Keep identical to src/lib/safeUrl.ts. */
export const API_BASE = "https://vlwsrrbofnnatctezsmn.supabase.co/functions/v1";
export const MIN_PASSWORD = 8;

export function allowedAppUrl(raw: string, appBase: string): boolean {
  try {
    const u = new URL(raw);
    const b = new URL(appBase);
    if (u.origin !== b.origin) return false;
    const root = b.pathname.replace(/\/$/, "") || "";
    return u.pathname === root || u.pathname.startsWith(`${root}/`);
  } catch {
    return false;
  }
}

export function allowedApi(raw: string): boolean {
  const a = raw.replace(/\/$/, "");
  return a === API_BASE || a.startsWith(`${API_BASE}/`);
}

export function passwordError(password: string): string | null {
  if (password.length < MIN_PASSWORD) return `Password must be at least ${MIN_PASSWORD} characters.`;
  return null;
}

/** Where Checkout sends the customer. A missing or rejected return address still keeps their portal token. */
export function portalPayReturn(returnTo: unknown, appBase: string, token: string): string {
  if (typeof returnTo === "string" && allowedAppUrl(returnTo, appBase)) return returnTo;
  return `${appBase}/portal.html?t=${encodeURIComponent(String(token))}`;
}

/** Stripe success_url. A return address that already has a query string keeps it, then paid=1. */
export function checkoutPaidUrl(back: string): string {
  if (!back) return "https://stripe.com";
  return `${back}${back.includes("?") ? "&" : "?"}paid=1`;
}
