// Sends the same in-app notification to the account's registered phones.
// Missing APNs or FCM secrets skip that platform; a send failure must not undo the notification row.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const text = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemBytes(pem: string): Uint8Array {
  const body = pem.replace(/\\n/g, "\n").replace(/-----[^-]+-----/g, "").replace(/\s/g, "");
  const raw = atob(body);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function signJwt(alg: "ES256" | "RS256", pkcs8: Uint8Array, kid: string | undefined, claims: Record<string, unknown>): Promise<string> {
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pkcs8,
    alg === "ES256" ? { name: "ECDSA", namedCurve: "P-256" } : { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const header = b64url(text.encode(JSON.stringify(kid ? { alg, kid, typ: "JWT" } : { alg, typ: "JWT" })));
  const payload = b64url(text.encode(JSON.stringify(claims)));
  const sig = new Uint8Array(await crypto.subtle.sign(
    alg === "ES256" ? { name: "ECDSA", hash: "SHA-256" } : { name: "RSASSA-PKCS1-v1_5" },
    key,
    text.encode(`${header}.${payload}`),
  ));
  return `${header}.${payload}.${b64url(sig)}`;
}

let apnsJwt = "";
let apnsJwtAt = 0;
async function appleJwt(): Promise<{ jwt: string; host: string; topic: string } | null> {
  const keyId = Deno.env.get("APNS_KEY_ID");
  const teamId = Deno.env.get("APNS_TEAM_ID");
  const privateKey = Deno.env.get("APNS_PRIVATE_KEY");
  const topic = Deno.env.get("APNS_BUNDLE_ID");
  const envName = (Deno.env.get("APNS_ENV") ?? "").toLowerCase();
  if (!keyId || !teamId || !privateKey || !topic || (envName !== "production" && envName !== "sandbox")) return null;
  const now = Math.floor(Date.now() / 1000);
  if (!apnsJwt || now - apnsJwtAt > 3000) {
    apnsJwt = await signJwt("ES256", pemBytes(privateKey), keyId, { iss: teamId, iat: now });
    apnsJwtAt = now;
  }
  return { jwt: apnsJwt, host: envName === "sandbox" ? "https://api.sandbox.push.apple.com" : "https://api.push.apple.com", topic };
}

let fcmToken = "";
let fcmTokenExp = 0;
let fcmProject = "";
async function googleAccessToken(): Promise<{ token: string; project: string } | null> {
  const raw = Deno.env.get("FCM_SERVICE_ACCOUNT_JSON");
  if (!raw) return null;
  const sa = JSON.parse(raw) as { client_email?: string; private_key?: string; project_id?: string };
  if (!sa.client_email || !sa.private_key || !sa.project_id) return null;
  const now = Math.floor(Date.now() / 1000);
  if (fcmToken && now < fcmTokenExp - 60 && fcmProject === sa.project_id) return { token: fcmToken, project: fcmProject };
  const assertion = await signJwt("RS256", pemBytes(sa.private_key), undefined, {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  });
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  if (!r.ok) throw new Error(`FCM auth failed: ${(await r.text()).slice(0, 200)}`);
  const body = await r.json() as { access_token: string; expires_in: number };
  fcmToken = body.access_token;
  fcmTokenExp = now + (body.expires_in || 3600);
  fcmProject = sa.project_id;
  return { token: fcmToken, project: fcmProject };
}

function deadToken(status: number, body: string): boolean {
  if (status === 404 || status === 410) return true;
  return /BadDeviceToken|Unregistered|UNREGISTERED|INVALID_ARGUMENT|NotRegistered/i.test(body);
}

/** Push one in-app notification to every phone signed into that business. */
export async function pushToAccount(db: SupabaseClient, ownerId: string, note: { title: string; body: string; link: string }): Promise<void> {
  const ids = new Set<string>([ownerId]);
  const { data: members } = await db.from("account_members").select("user_id").eq("owner_id", ownerId);
  for (const m of members ?? []) if (m.user_id) ids.add(m.user_id as string);
  const { data: rows } = await db.from("device_tokens").select("token, platform").in("user_id", [...ids]);
  if (!rows?.length) return;

  const apple = await appleJwt();
  const google = rows.some((r) => r.platform === "android") ? await googleAccessToken() : null;
  const drop: string[] = [];

  for (const row of rows) {
    const token = row.token as string;
    try {
      if (row.platform === "ios") {
        if (!apple) continue;
        const r = await fetch(`${apple.host}/3/device/${token}`, {
          method: "POST",
          headers: {
            authorization: `bearer ${apple.jwt}`,
            "apns-topic": apple.topic,
            "apns-push-type": "alert",
            "apns-priority": "10",
          },
          body: JSON.stringify({ aps: { alert: { title: note.title, body: note.body }, sound: "default" }, link: note.link }),
        });
        if (!r.ok) {
          const err = await r.text();
          if (deadToken(r.status, err)) drop.push(token);
          else console.error("apns", r.status, err.slice(0, 200));
        }
      } else if (row.platform === "android") {
        if (!google) continue;
        const r = await fetch(`https://fcm.googleapis.com/v1/projects/${google.project}/messages:send`, {
          method: "POST",
          headers: { Authorization: `Bearer ${google.token}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            message: {
              token,
              notification: { title: note.title, body: note.body },
              data: { link: note.link },
              android: { priority: "HIGH" },
            },
          }),
        });
        if (!r.ok) {
          const err = await r.text();
          if (deadToken(r.status, err)) drop.push(token);
          else console.error("fcm", r.status, err.slice(0, 200));
        }
      }
    } catch (e) {
      console.error("push", e);
    }
  }
  if (drop.length) await db.from("device_tokens").delete().in("token", drop);
}
