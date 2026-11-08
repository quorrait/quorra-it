import { useState } from "react";
import { useData } from "../lib/app";
import { useToast } from "./ui";
import { ACCESS, EDITABLE, FEATURE_LABEL, type RoleAccess } from "../lib/access";
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

  async function toggle(f: (typeof EDITABLE)[number], on: boolean) {
    const next = on ? [...new Set([...list, f])] : list.filter((x) => x !== f);
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
      <div className="small muted">Choose what each kind of team member can open. For example, turn off "Money and totals" for Technicians so they never see prices. Pick a role below, then switch screens on or off. Billing is always owner-only.</div>
      <div className="chips">{ROLES.map((r) => <button key={r} className={`chip${role === r ? " on" : ""}`} onClick={() => setRole(r)}>{r}</button>)}</div>
      {EDITABLE.map((f) => (
        <label key={f} className="check-row" style={{ justifyContent: "space-between" }}>
          <span>{FEATURE_LABEL[f]}</span>
          <input type="checkbox" checked={list.includes(f)} onChange={(e) => void toggle(f, e.target.checked)} />
        </label>
      ))}
      {saved[role] && <button className="btn" onClick={() => void reset()}>Reset {role} to the default</button>}
    </div>
  );
}
