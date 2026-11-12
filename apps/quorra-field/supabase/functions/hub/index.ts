// Quorra Dispatch Hub: for platform admins only (listed in public.platform_admins). Leave Verify JWT ON.
// Actions: overview, tickets, ticket_update, impersonate.
import { admin, appUrl, env, handler, HttpError, json, requireUser } from "../_shared/util.ts";
import { allowedAppUrl } from "../_shared/safeUrl.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const DAY = 86400000;
function accessOf(s: { status?: string; comped?: boolean; past_due_since?: string | null; cancel_at_period_end?: boolean } | undefined): string {
  if (!s) return "none";
  if (s.comped) return "free";
  if (s.status === "active") return s.cancel_at_period_end ? "active, canceling" : "active";
  if (s.status !== "past_due") return s.status ?? "none";
  const since = s.past_due_since ? new Date(s.past_due_since).getTime() : Date.now();
  const days = (Date.now() - since) / DAY;
  if (days < 7) return "grace";
  if (days < 37) return "reviewer";
  return "closed";
}

handler(async (req) => {
  if (req.method !== "POST") throw new HttpError(405, "POST only");
  const user = await requireUser(req);
  const db = admin();
  const email = (user.email ?? "").toLowerCase();
  const authHeader = req.headers.get("Authorization") ?? "";
  const asUser = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: ok } = await asUser.rpc("is_platform_admin");
  if (!ok) throw new HttpError(403, "Not allowed");
  const b = await req.json().catch(() => ({}));

  if (b.action === "overview") {
    const [{ data: biz }, { data: subs }, { data: members }, { data: tix }, users] = await Promise.all([
      db.from("business").select("owner_id,name,phone,email"),
      db.from("subscriptions").select("owner_id,status,plan,amount_cents,billing_interval,current_period_end,comped,cancel_at_period_end,past_due_since,promo_fix_needed,promo_fix_detail"),
      db.from("account_members").select("owner_id"),
      db.from("support_tickets").select("id").eq("status", "open"),
      db.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    ]);
    const u = new Map((users.data?.users ?? []).map((x) => [x.id, x]));
    const sub = new Map((subs ?? []).map((s) => [s.owner_id, s]));
    const team = new Map<string, number>();
    for (const m of members ?? []) team.set(m.owner_id, (team.get(m.owner_id) ?? 0) + 1);
    const rows = (biz ?? []).map((x) => {
      const s = sub.get(x.owner_id);
      const au = u.get(x.owner_id);
      return { owner_id: x.owner_id, name: x.name, login: au?.email ?? x.email, phone: x.phone, created_at: au?.created_at ?? null, last_sign_in: au?.last_sign_in_at ?? null, plan: s?.plan ?? "-", status: s?.status ?? "none", access: accessOf(s), comped: Boolean(s?.comped), amount_cents: s?.amount_cents ?? 0, interval: s?.billing_interval ?? "month", period_end: s?.current_period_end ?? null, canceling: Boolean(s?.cancel_at_period_end), team: (team.get(x.owner_id) ?? 0) + 1, promo_fix: Boolean(s?.promo_fix_needed), promo_fix_detail: (s?.promo_fix_detail as string | null) ?? null };
    }).sort((a, c) => String(c.created_at).localeCompare(String(a.created_at)));
    return json({ rows, open_tickets: (tix ?? []).length });
  }

  if (b.action === "tickets") {
    const { data } = await db.from("support_tickets").select("*").order("created_at", { ascending: false }).limit(200);
    return json({ tickets: data ?? [] });
  }

  if (b.action === "ticket_update") {
    const status = ["open", "resolved"].includes(b.status) ? b.status : "open";
    await db.from("support_tickets").update({ status }).eq("id", String(b.id));
    return json({ ok: true });
  }

  if (b.action === "impersonate") {
    const owner = String(b.owner_id ?? "");
    const { data: target } = await db.auth.admin.getUserById(owner);
    if (!target?.user?.email) throw new HttpError(404, "No login found for that business");
    const back = String(b.return_to ?? "");
    if (back && !allowedAppUrl(back, appUrl())) throw new HttpError(400, "That return address is not allowed");
    const { data, error } = await db.auth.admin.generateLink({ type: "magiclink", email: target.user.email, options: back ? { redirectTo: back } : undefined });
    if (error || !data?.properties?.action_link) throw new HttpError(500, error?.message ?? "Could not make a link");
    await db.from("hub_audit").insert({ admin_email: email, action: "sign_in_as", target_owner: owner });
    return json({ link: data.properties.action_link, email: target.user.email });
  }

  throw new HttpError(400, "Unknown action");
});
