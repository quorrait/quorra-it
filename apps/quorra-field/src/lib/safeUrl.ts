/** Keep identical to supabase/functions/_shared/safeUrl.ts. */
export const API_BASE = "https://vlwsrrbofnnatctezsmn.supabase.co/functions/v1";
export const MIN_PASSWORD = 8;

/** True when raw is the app itself or a page under it. Rejects other sites and javascript: URLs. */
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

/** True when raw is our functions host, not a caller-supplied API. */
export function allowedApi(raw: string): boolean {
  const a = raw.replace(/\/$/, "");
  return a === API_BASE || a.startsWith(`${API_BASE}/`);
}

export function passwordError(password: string): string | null {
  if (password.length < MIN_PASSWORD) return `Password must be at least ${MIN_PASSWORD} characters.`;
  return null;
}
