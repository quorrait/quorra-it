import { useState } from "react";
import { useData } from "../lib/app";
import { useToast } from "./ui";
import { ACCESS, type Feature, type RoleAccess } from "../lib/access";
import AccessEditor from "./AccessEditor";
import type { Role } from "../lib/types";
import { errMsg } from "../lib/errors";

const ROLES: Role[] = ["Manager", "Office", "Sales", "Technician"];

/** Owner switches screens on or off for each role. Billing always stays owner-only. */
export default function RoleAccessCard() {
  const { business, store, refresh } = useData();
  const toast = useToast();
  const [role, setRole] = useState<Role>("Manager");
  const saved = (business.role_access ?? {}) as RoleAccess;
  const list = saved[role] ?? ACCESS[role];

  async function setList(next: Feature[]) {
    try { await store.saveBusiness({ role_access: { ...saved, [role]: next } }); await refresh(); }
    catch (e) { toast(errMsg(e, "Could not save. Run the latest database update first.")); }
  }
  async function reset() {
    const { [role]: _drop, ...rest } = saved; void _drop;
    try { await store.saveBusiness({ role_access: rest }); await refresh(); toast(`${role} access reset`); } catch (e) { toast(errMsg(e, "Could not save")); }
  }

  return (
    <div className="card stack">
      <div className="card-title" style={{ margin: 0 }}>Who can see what</div>
      <div className="small muted">Choose what each kind of team member can open. This sets the default for everyone with that role. To change just one person, open them under Team. Billing is always owner-only.</div>
      <div className="chips">{ROLES.map((r) => <button key={r} className={`chip${role === r ? " on" : ""}`} onClick={() => setRole(r)}>{r}</button>)}</div>
      <AccessEditor list={list} onChange={(next) => void setList(next)} />
      {saved[role] && <button className="btn" onClick={() => void reset()}>Reset {role} to the default</button>}
    </div>
  );
}
