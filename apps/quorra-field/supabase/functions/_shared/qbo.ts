// QuickBooks Online helpers: OAuth state signing, token refresh, authenticated API calls.
import { admin, env, HttpError } from "./util.ts";

export const QBO_AUTH_URL = "https://appcenter.intuit.com/connect/oauth2";
export const QBO_TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
export const qboBase = () =>
  (Deno.env.get("QBO_ENV") ?? "sandbox") === "production"
    ? "https://quickbooks.api.intuit.com"
    : "https://sandbox-quickbooks.api.intuit.com";
export const MINOR_VERSION = "75";

export const redirectUri = () => `${env("SUPABASE_URL")}/functions/v1/qbo-callback`;

const basicAuth = () => "Basic " + btoa(`${env("QBO_CLIENT_ID")}:${env("QBO_CLIENT_SECRET")}`);

/* ---- signed OAuth `state`, so the callback knows which user started the flow (CSRF protection) ---- */
const enc = new TextEncoder();
const b64 = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function hmac(data: string) {
  const key = await crypto.subtle.importKey("raw", enc.encode(env("QBO_STATE_SECRET")), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}

export async function signState(userId: string) {
  const payload = `${userId}.${Date.now()}`;
  return `${payload}.${await hmac(payload)}`;
}

export async function verifyState(state: string | null): Promise<string> {
  if (!state) throw new HttpError(400, "Missing state");
  const [userId, ts, sig] = state.split(".");
  if (!userId || !ts || !sig || (await hmac(`${userId}.${ts}`)) !== sig) throw new HttpError(400, "Bad state");
  if (Date.now() - Number(ts) > 15 * 60 * 1000) throw new HttpError(400, "Connection link expired, try again");
  return userId;
}

/* ---- tokens ---- */
interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

async function tokenRequest(params: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(QBO_TOKEN_URL, {
    method: "POST",
    headers: { Authorization: basicAuth(), "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams(params),
  });
  if (!res.ok) throw new HttpError(502, `QuickBooks token error (${res.status})`);
  return await res.json();
}

export const exchangeCode = (code: string) =>
  tokenRequest({ grant_type: "authorization_code", code, redirect_uri: redirectUri() });

/** Returns a valid access token + realm for this owner, refreshing (and saving the rotated refresh token) if needed. */
export async function getConnection(ownerId: string) {
  const db = admin();
  const { data: c } = await db.from("qbo_connections").select("*").eq("owner_id", ownerId).maybeSingle();
  if (!c) throw new HttpError(400, "QuickBooks is not connected");

  if (new Date(c.expires_at).getTime() - Date.now() > 5 * 60 * 1000) return { realm: c.realm_id as string, token: c.access_token as string };

  let t: TokenResponse;
  try {
    t = await tokenRequest({ grant_type: "refresh_token", refresh_token: c.refresh_token });
  } catch {
    await db.from("business").update({ qbo_connected: false }).eq("owner_id", ownerId);
    throw new HttpError(401, "QuickBooks connection expired. Reconnect it in Settings.");
  }
  await db.from("qbo_connections").update({
    access_token: t.access_token,
    refresh_token: t.refresh_token,
    expires_at: new Date(Date.now() + t.expires_in * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("owner_id", ownerId);
  return { realm: c.realm_id as string, token: t.access_token };
}

/* ---- API ---- */
export async function qbo<T = any>(conn: { realm: string; token: string }, method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const sep = path.includes("?") ? "&" : "?";
  const res = await fetch(`${qboBase()}/v3/company/${conn.realm}/${path}${sep}minorversion=${MINOR_VERSION}`, {
    method,
    headers: { Authorization: `Bearer ${conn.token}`, Accept: "application/json", "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    console.error("QBO error", res.status, text);
    let detail = "";
    try {
      detail = JSON.parse(text)?.Fault?.Error?.[0]?.Detail ?? "";
    } catch { /* not JSON */ }
    throw new HttpError(502, `QuickBooks rejected the request${detail ? `: ${detail}` : ` (${res.status})`}`);
  }
  return JSON.parse(text);
}

export const qboQuery = async <T = any>(conn: { realm: string; token: string }, sql: string): Promise<T> =>
  (await qbo(conn, "GET", `query?query=${encodeURIComponent(sql)}`)).QueryResponse;

/** Escape a value for use inside single quotes in a QBO query. */
export const q = (s: string) => s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
