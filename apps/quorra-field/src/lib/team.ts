import { hasSupabase, supabase } from "./supabase";
import type { Invite } from "./types";

const INVITE_KEY = "qd-invite";
const DEMO_KEY = "qd-demo-invites";

export const pendingInviteCode = () => { try { return localStorage.getItem(INVITE_KEY); } catch { return null; } };
export const rememberInvite = (code: string | null) => { try { code ? localStorage.setItem(INVITE_KEY, code) : localStorage.removeItem(INVITE_KEY); } catch { /* ignore */ } };

/** Link to send to a new team member. */
export const inviteUrl = (code: string) => `${location.origin}${import.meta.env.BASE_URL}#/join?code=${code}`;

/** Read ?code= from the hash route (HashRouter keeps the query after the #). */
export const codeFromHash = () => new URLSearchParams(location.hash.split("?")[1] ?? "").get("code");

const demoList = (): Invite[] => { try { return JSON.parse(localStorage.getItem(DEMO_KEY) ?? "[]"); } catch { return []; } };
const demoSave = (l: Invite[]) => { try { localStorage.setItem(DEMO_KEY, JSON.stringify(l)); } catch { /* ignore */ } };

export async function listInvites(): Promise<Invite[]> {
  if (!hasSupabase || !supabase) return demoList();
  const { data, error } = await supabase.from("invites").select("*").order("created_at", { ascending: false });
  if (error) return []; // table missing until migration 0010 is run
  return data as Invite[];
}

export async function createInvite(member: { id: string; email: string; role: string }): Promise<Invite> {
  if (!hasSupabase || !supabase) {
    const inv: Invite = { id: crypto.randomUUID(), team_member_id: member.id, email: member.email, role: member.role, code: crypto.randomUUID().replace(/-/g, ""), status: "pending", created_at: new Date().toISOString() };
    demoSave([inv, ...demoList().filter((i) => i.team_member_id !== member.id)]);
    return inv;
  }
  const me = (await supabase.auth.getSession()).data.session?.user.email?.toLowerCase();
  if (me && me === member.email.trim().toLowerCase()) throw new Error("That is your own login email. Use a different email for team members. Tip: yourname+tech@gmail.com also reaches your inbox.");
  // one open invite per person
  await supabase.from("invites").update({ status: "revoked" }).eq("team_member_id", member.id).eq("status", "pending");
  const { data, error } = await supabase.from("invites").insert({ team_member_id: member.id, email: member.email.trim().toLowerCase(), role: member.role }).select().single();
  if (error) throw new Error(error.message.includes("relation") ? "Run the latest database update (0010) first." : error.message);
  return data as Invite;
}

export async function revokeAccess(memberId: string) {
  if (!hasSupabase || !supabase) { demoSave(demoList().filter((i) => i.team_member_id !== memberId)); return; }
  const { error } = await supabase.rpc("revoke_access", { p_team_member: memberId });
  if (error) throw new Error(error.message);
}

export async function inviteInfo(code: string): Promise<{ business: string; email: string; role: string } | null> {
  if (!supabase) return null;
  const { data } = await supabase.rpc("invite_info", { p_code: code });
  return (data as { business: string; email: string; role: string } | null) ?? null;
}

/** Join the business that sent the invite. Returns an error message, or null on success. */
export async function acceptInvite(code: string): Promise<string | null> {
  if (!supabase) return null;
  const { error } = await supabase.rpc("accept_invite", { p_code: code });
  return error ? error.message : null;
}

/** Emails the invite link through the send-invite function. Returns an error message, or null when the email went out. */
export async function emailInvite(code: string): Promise<string | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.functions.invoke("send-invite", { body: { code, link: inviteUrl(code) } });
  if (error) return "Could not send the email. Copy the link instead.";
  const r = data as { ok?: boolean; reason?: string } | null;
  return r?.ok ? null : r?.reason?.includes("not set up") ? "Email sending is not set up yet. Copy the link instead." : r?.reason || "Could not send the email. Copy the link instead.";
}
