import { errMsg } from "../lib/errors";
import { useEffect, useState } from "react";
import { useData } from "../lib/app";
import { Field, Icon, Sheet, Spinner, useToast, useConfirm } from "../components/ui";
import ColorPick from "../components/ColorPick";
import { centsToStr, strToCents } from "../components/LineItems";
import type { Invite, Role, TeamMember } from "../lib/types";
import { createInvite, emailInvite, inviteUrl, listInvites, revokeAccess } from "../lib/team";
import { planByName } from "../lib/plans";
import { hasSupabase } from "../lib/supabase";

const COLORS = ["#f26b21", "#2563eb", "#16a34a", "#9333ea", "#db2777", "#0891b2", "#ca8a04"];
const ROLES: Role[] = ["Owner", "Manager", "Office", "Sales", "Technician"];

export const initials = (n: string) => n.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();


/** Invite a team member so they can sign in to this business with their own login. */
function InvitePanel({ m, invites, reload }: { m: TeamMember; invites: Invite[]; reload(): Promise<void> }) {
  const { business, subscription } = useData();
  const toast = useToast();
  const ask = useConfirm();
  const [busy, setBusy] = useState(false);
  const mine = invites.find((i) => i.team_member_id === m.id && (i.status === "pending" || i.status === "accepted"));
  const link = mine?.status === "pending" ? inviteUrl(mine.code) : "";
  const msg = `You're invited to join ${business.name || "our team"} on Quorra Dispatch. Create your login with ${m.email}: ${link}`;

  async function send() {
    if (!m.email.trim()) return toast("Add an email address first");
    const seats = subscription?.comped ? Infinity : planByName(subscription?.plan)?.seats ?? Infinity;
    const used = 1 + invites.filter((i) => i.status !== "revoked" && i.team_member_id !== m.id).length; // the owner plus everyone else with a login or open invite
    if (used >= seats) return toast(`Your ${subscription?.plan} plan includes ${seats} ${seats === 1 ? "login" : "logins"}. Upgrade under Billing to add more.`);
    setBusy(true);
    try {
      const inv = await createInvite({ id: m.id, email: m.email, role: m.role });
      await reload();
      const bad = await emailInvite(inv.code);
      toast(bad ?? `Invite emailed to ${m.email}`);
    }
    catch (e) { toast(errMsg(e, "Could not create the invite")); }
    finally { setBusy(false); }
  }
  async function remove() {
    if (!(await ask({ title: `Remove ${m.name}'s access?`, message: "They will no longer be able to sign in to this business.", confirmLabel: "Remove access", danger: true }))) return;
    setBusy(true);
    try { await revokeAccess(m.id); await reload(); toast("Access removed"); }
    catch (e) { toast(errMsg(e, "Could not remove access")); }
    finally { setBusy(false); }
  }

  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="small bold">Sign-in access</div>
      {mine?.status === "accepted" && (
        <>
          <div className="row between"><span className="badge good">{Icon.check} Has access</span><button className="btn sm danger" disabled={busy} onClick={remove}>Remove access</button></div>
          <div className="small muted">{m.name} signs in with {mine.email} and sees the screens that fit the {m.role} role.</div>
        </>
      )}
      {mine?.status === "pending" && (
        <>
          <span className="badge blue">Invite sent, waiting for sign-up</span>
          <input className="input" readOnly value={link} onFocus={(e) => e.currentTarget.select()} aria-label="Invite link" />
          <div className="row wrap">
            <button className="btn primary" disabled={busy} onClick={async () => { setBusy(true); const bad = mine && await emailInvite(mine.code); setBusy(false); toast(bad || `Invite emailed to ${m.email}`); }}>Resend email</button>
            <a className="btn" href={`mailto:${m.email}?subject=${encodeURIComponent(`Join ${business.name} on Quorra Dispatch`)}&body=${encodeURIComponent(msg)}`}>Email invite</a>
            {m.phone && <a className="btn" href={`sms:${m.phone}?&body=${encodeURIComponent(msg)}`}>Text invite</a>}
            <button className="btn" onClick={async () => { try { await navigator.clipboard.writeText(link); toast("Invite link copied"); } catch { toast("Select the link and copy it"); } }}>Copy link</button>
          </div>
          <div className="small muted">They must create their login with {mine.email}. The link only works once.</div>
          <div><button className="btn sm danger" disabled={busy} onClick={remove}>Cancel invite</button></div>
        </>
      )}
      {!mine && (
        <>
          <div className="small muted">Give {m.name || "this person"} their own login so they can see their jobs on their phone.{!hasSupabase && " (Demo: the invite link is a sample.)"}</div>
          <div><button className="btn primary" disabled={busy || !m.email.trim()} onClick={send}>Invite to sign in</button>{!m.email.trim() && <span className="small muted"> Add an email address first.</span>}</div>
        </>
      )}
    </div>
  );
}

function MemberForm({ m, invites, reload, onClose }: { m?: TeamMember; invites: Invite[]; reload(): Promise<void>; onClose(): void }) {
  const { store, refresh, team } = useData();
  const toast = useToast();
  const ask = useConfirm();
  const [f, setF] = useState({ name: m?.name ?? "", role: m?.role ?? ("Technician" as Role), phone: m?.phone ?? "", email: m?.email ?? "", rate: centsToStr(m?.hourly_cents ?? 0), comm: String(m?.commission_pct ?? 0), color: m?.color ?? COLORS[team.length % COLORS.length], active: m?.active ?? true });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  return (
    <Sheet title={m ? "Edit team member" : "Add team member"} onClose={onClose}>
      <div className="stack">
        <Field label="Name"><input className="input" value={f.name} onChange={set("name")} /></Field>
        <div className="grid2 stack-sm">
          <Field label="Role"><select className="select" value={f.role} onChange={set("role")}>{ROLES.map((r) => <option key={r}>{r}</option>)}</select></Field>
          <Field label="Phone"><input className="input" type="tel" value={f.phone} onChange={set("phone")} /></Field>
        </div>
        <Field label="Email"><input className="input" type="email" value={f.email} onChange={set("email")} /></Field>
        <div className="grid2 stack-sm">
          <Field label="Hourly cost ($)"><input className="input" inputMode="decimal" value={f.rate} onChange={set("rate")} /></Field>
          <Field label="Commission %"><input className="input" inputMode="decimal" value={f.comm} onChange={set("comm")} /></Field>
        </div>
        <Field label="Color"><ColorPick value={f.color} onChange={(c) => setF({ ...f, color: c })} swatches={COLORS} label="Team color" /></Field>
        {m && <InvitePanel m={{ ...m, email: f.email, name: f.name || m.name, phone: f.phone, role: f.role }} invites={invites} reload={reload} />}
        <Field label="Status"><select className="select" value={f.active ? "1" : "0"} onChange={(e) => setF({ ...f, active: e.target.value === "1" })}><option value="1">Active: can be assigned jobs</option><option value="0">Inactive: hidden from scheduling</option></select></Field>
        <button className="btn primary block" onClick={async () => {
          if (!f.name.trim()) return toast("Add a name");
          await store.saveRow("team_members", { id: m?.id, name: f.name.trim(), role: f.role, phone: f.phone, email: f.email, hourly_cents: strToCents(f.rate), commission_pct: parseFloat(f.comm) || 0, color: f.color, active: f.active });
          await refresh(); toast("Saved"); onClose();
        }}>Save</button>
        {!m && (
          <button className="btn block" onClick={async () => {
            if (!f.name.trim()) return toast("Add a name");
            if (!f.email.trim()) return toast("Add an email address to invite them");
            const saved = await store.saveRow("team_members", { name: f.name.trim(), role: f.role, phone: f.phone, email: f.email, hourly_cents: strToCents(f.rate), commission_pct: parseFloat(f.comm) || 0, color: f.color, active: f.active });
            try {
              const inv = await createInvite({ id: saved.id, email: f.email, role: f.role });
              const bad = await emailInvite(inv.code);
              toast(bad ? `Saved. ${bad}` : `Invite emailed to ${f.email}`);
            }
            catch (e) { toast(errMsg(e, "Saved, but the invite failed")); }
            await refresh(); await reload(); onClose();
          }}>Save and send invite</button>
        )}
        {m && <button className="btn danger block" onClick={async () => { if (await ask({ title: "Delete this member?", message: "Their past time entries stay.", confirmLabel: "Delete", danger: true })) { await store.deleteRow("team_members", m.id); await refresh(); onClose(); } }}>Delete</button>}
      </div>
    </Sheet>
  );
}

export default function Team() {
  const { loading, team, jobs } = useData();
  const [edit, setEdit] = useState<TeamMember | "new" | null>(null);
  const [invites, setInvites] = useState<Invite[]>([]);
  const reload = async () => setInvites(await listInvites());
  useEffect(() => { void reload(); }, []);
  if (loading) return <Spinner />;
  return (
    <div className="stack">
      <div className="page-head">
        <div><h1 className="page-title">Team</h1><p className="page-sub">Everyone you can assign jobs to.</p></div>
        <button className="btn primary" onClick={() => setEdit("new")}>{Icon.plus} Invite or add member</button>
      </div>
      <div className="card flush"><div className="list">
        {team.map((m) => (
          <div key={m.id} className="list-item" onClick={() => setEdit(m)}>
            <div className="avatar" style={{ background: m.color }}>{initials(m.name)}</div>
            <div className="grow">
              <div className="title">{m.name} {!m.active && <span className="badge gray">inactive</span>} {invites.some((i) => i.team_member_id === m.id && i.status === "accepted") ? <span className="badge good">has login</span> : invites.some((i) => i.team_member_id === m.id && i.status === "pending") ? <span className="badge blue">invited</span> : null}</div>
              <div className="small muted">{m.role}{m.phone ? ` · ${m.phone}` : ""}</div>
            </div>
            <div className="right small muted">{jobs.filter((j) => j.assigned_to === m.name && j.status !== "completed" && j.status !== "canceled").length} open jobs<br />{m.commission_pct}% commission</div>
          </div>
        ))}
      </div></div>
      {edit && <MemberForm m={edit === "new" ? undefined : edit} invites={invites} reload={reload} onClose={() => setEdit(null)} />}
    </div>
  );
}
