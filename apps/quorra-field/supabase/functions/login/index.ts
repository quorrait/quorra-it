// Password sign-in with a per-email lockout. Deploy with --no-verify-jwt.
// The app calls this, then supabase.auth.setSession. Password reset stays on Supabase Auth
// and still works while an email is locked. A completed reset calls this with { action: "clear" }.
// A per-IP cap slows password spraying. It does not lock an email.
import { admin, env, handler, HttpError, json, requireUser } from "../_shared/util.ts";
import { clientIp, rateLimit } from "../_shared/limit.ts";
import { decayed, freshAttempt, lockMessage, onFailure, type AttemptState } from "../_shared/loginLock.ts";

const IP_LIMIT = 30;
const IP_WINDOW_SECONDS = 15 * 60;

type AuthBody = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  expires_at?: number;
  token_type?: string;
  error?: string;
  error_description?: string;
  error_code?: string;
  msg?: string;
  message?: string;
};

async function emailHash(email: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(email));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function isBadPassword(status: number, body: AuthBody): boolean {
  if (status !== 400) return false;
  const code = `${body.error_code ?? ""} ${body.error ?? ""}`.toLowerCase();
  const msg = `${body.error_description ?? ""} ${body.msg ?? ""} ${body.message ?? ""}`.toLowerCase();
  if (code.includes("not_confirmed") || msg.includes("not confirmed")) return false;
  return code.includes("invalid_credentials") || code.includes("invalid_grant") || msg.includes("invalid login");
}

async function loadAttempt(hash: string): Promise<AttemptState> {
  const { data, error } = await admin().from("login_attempts")
    .select("fail_count, lock_count, locked_until, last_failed_at")
    .eq("email_hash", hash)
    .maybeSingle();
  if (error) { console.error(error); throw new HttpError(500, "Server error"); }
  if (!data) return freshAttempt();
  return {
    fail_count: data.fail_count ?? 0,
    lock_count: data.lock_count ?? 0,
    locked_until: data.locked_until,
    last_failed_at: data.last_failed_at,
  };
}

async function saveAttempt(hash: string, state: AttemptState, ip: string): Promise<void> {
  const { error } = await admin().from("login_attempts").upsert({
    email_hash: hash,
    fail_count: state.fail_count,
    lock_count: state.lock_count,
    locked_until: state.locked_until,
    last_failed_at: state.last_failed_at,
    last_ip: ip,
    updated_at: new Date().toISOString(),
  }, { onConflict: "email_hash" });
  if (error) { console.error(error); throw new HttpError(500, "Server error"); }
}

async function clearAttempt(hash: string): Promise<void> {
  const { error } = await admin().from("login_attempts").delete().eq("email_hash", hash);
  if (error) { console.error(error); throw new HttpError(500, "Server error"); }
}

handler(async (req) => {
  if (req.method !== "POST") throw new HttpError(405, "POST only");
  const body = await req.json().catch(() => ({}));

  if (body?.action === "clear") {
    const user = await requireUser(req);
    const email = user.email?.trim().toLowerCase() ?? "";
    if (!email) throw new HttpError(400, "No email on this login.");
    await clearAttempt(await emailHash(email));
    return json({ ok: true });
  }

  const email = String(body?.email ?? "").trim().toLowerCase();
  const password = String(body?.password ?? "");
  if (!email.includes("@") || password.length < 1 || password.length > 200) throw new HttpError(400, "Enter your email and password.");

  const ip = clientIp(req);
  await rateLimit("login", ip, IP_LIMIT, IP_WINDOW_SECONDS);

  const hash = await emailHash(email);
  const now = Date.now();
  const row = decayed(await loadAttempt(hash), now);
  if (row.locked_until && new Date(row.locked_until).getTime() > now) {
    await admin().from("login_attempts").update({ last_ip: ip, updated_at: new Date().toISOString() }).eq("email_hash", hash);
    throw new HttpError(429, lockMessage(row.locked_until, now));
  }

  const authRes = await fetch(`${env("SUPABASE_URL")}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: env("SUPABASE_ANON_KEY"),
      Authorization: `Bearer ${env("SUPABASE_ANON_KEY")}`,
    },
    body: JSON.stringify({ email, password }),
  });
  const authBody = await authRes.json().catch(() => ({})) as AuthBody;
  if (authRes.ok && authBody.access_token && authBody.refresh_token) {
    await clearAttempt(hash);
    return json({
      access_token: authBody.access_token,
      refresh_token: authBody.refresh_token,
      expires_in: authBody.expires_in ?? null,
      expires_at: authBody.expires_at ?? null,
      token_type: authBody.token_type ?? "bearer",
    });
  }

  if (isBadPassword(authRes.status, authBody)) {
    const next = onFailure(row, now);
    await saveAttempt(hash, next.state, ip);
    if (next.locked && next.state.locked_until) throw new HttpError(429, lockMessage(next.state.locked_until, now));
    throw new HttpError(401, "Email or password is incorrect.");
  }

  const msg = String(authBody.error_description || authBody.msg || authBody.message || "Could not sign in.");
  throw new HttpError(authRes.status === 429 ? 429 : 400, msg);
});
