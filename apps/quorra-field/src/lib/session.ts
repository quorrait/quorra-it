import { supabase } from "./supabase";

/** One device at a time: signing in elsewhere signs this device out. Needs database update 0020; without it nothing happens. */
const SID = "qd-sid", KICKED = "qd-kicked";
const get = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const set = (k: string, v: string | null) => { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* ignore */ } };

export const wasKicked = () => { const v = get(KICKED) === "1"; if (v) set(KICKED, null); return v; };

export async function claimSession(): Promise<void> {
  if (!supabase) return;
  const { data } = await supabase.auth.getUser();
  if (!data.user) return;
  const id = crypto.randomUUID();
  set(SID, id);
  await supabase.from("user_sessions").upsert({ user_id: data.user.id, session_id: id, updated_at: new Date().toISOString() });
}

/** Checks every 20 seconds and when the app comes back to the front. Returns a stop function. */
export function watchSession(onKicked: () => void): () => void {
  if (!supabase) return () => undefined;
  let stopped = false;
  const check = async () => {
    if (stopped || !supabase) return;
    const mine = get(SID);
    if (!mine) { await claimSession().catch(() => undefined); return; } // signed in before this feature existed
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { data, error } = await supabase.from("user_sessions").select("session_id").eq("user_id", u.user.id).maybeSingle();
    if (error || !data) return;
    if (data.session_id !== mine) { set(KICKED, "1"); set(SID, null); stopped = true; onKicked(); }
  };
  const t = setInterval(() => void check(), 20000);
  const vis = () => { if (document.visibilityState === "visible") void check(); };
  document.addEventListener("visibilitychange", vis);
  void check();
  return () => { stopped = true; clearInterval(t); document.removeEventListener("visibilitychange", vis); };
}
