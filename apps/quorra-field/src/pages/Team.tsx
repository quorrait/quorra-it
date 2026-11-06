import { useState } from "react";
import { useData } from "../lib/app";
import { Field, Icon, Sheet, Spinner, useToast } from "../components/ui";
import CalendarSync from "../components/CalendarSync";
import { centsToStr, strToCents } from "../components/LineItems";
import type { Role, TeamMember } from "../lib/types";

const COLORS = ["#f26b21", "#2563eb", "#16a34a", "#9333ea", "#db2777", "#0891b2", "#ca8a04"];
const ROLES: Role[] = ["Owner", "Manager", "Office", "Sales", "Technician"];

export const initials = (n: string) => n.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();

function MemberForm({ m, onClose }: { m?: TeamMember; onClose(): void }) {
  const { store, refresh, team } = useData();
  const toast = useToast();
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
        <Field label="Color">
          <div className="row wrap">{COLORS.map((c) => <button key={c} aria-label={c} onClick={() => setF({ ...f, color: c })} style={{ width: 32, height: 32, borderRadius: "50%", background: c, border: f.color === c ? "3px solid var(--ink)" : "3px solid transparent", cursor: "pointer" }} />)}</div>
        </Field>
        {m && <div className="stack"><div className="small bold">Phone calendar</div><CalendarSync memberId={m.id} /></div>}
        <label className="row"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Active</label>
        <button className="btn primary block" onClick={async () => {
          if (!f.name.trim()) return toast("Add a name");
          await store.saveRow("team_members", { id: m?.id, name: f.name.trim(), role: f.role, phone: f.phone, email: f.email, hourly_cents: strToCents(f.rate), commission_pct: parseFloat(f.comm) || 0, color: f.color, active: f.active });
          await refresh(); toast("Saved"); onClose();
        }}>Save</button>
        {m && <button className="btn danger block" onClick={async () => { if (confirm("Delete this member? Their past time entries stay.")) { await store.deleteRow("team_members", m.id); await refresh(); onClose(); } }}>Delete</button>}
      </div>
    </Sheet>
  );
}

export default function Team() {
  const { loading, team, jobs } = useData();
  const [edit, setEdit] = useState<TeamMember | "new" | null>(null);
  if (loading) return <Spinner />;
  return (
    <div className="stack">
      <div className="page-head">
        <div><h1 className="page-title">Team</h1><p className="page-sub">Everyone you can assign jobs to.</p></div>
        <button className="btn primary" onClick={() => setEdit("new")}>{Icon.plus} Add member</button>
      </div>
      <div className="card flush"><div className="list">
        {team.map((m) => (
          <div key={m.id} className="list-item" onClick={() => setEdit(m)}>
            <div className="avatar" style={{ background: m.color }}>{initials(m.name)}</div>
            <div className="grow">
              <div className="title">{m.name} {!m.active && <span className="badge gray">inactive</span>}</div>
              <div className="small muted">{m.role}{m.phone ? ` · ${m.phone}` : ""}</div>
            </div>
            <div className="right small muted">{jobs.filter((j) => j.assigned_to === m.name && j.status !== "completed" && j.status !== "canceled").length} open jobs<br />{m.commission_pct}% commission</div>
          </div>
        ))}
      </div></div>
      {edit && <MemberForm m={edit === "new" ? undefined : edit} onClose={() => setEdit(null)} />}
    </div>
  );
}
