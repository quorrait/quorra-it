import { useState } from "react";
import { useData } from "../lib/app";
import { Field, useToast } from "./ui";
import { useRegisterSave } from "../lib/saveAll";
import { errMsg } from "../lib/errors";
/** Compares settings ignoring key order (the database reorders JSON keys, which made saves look unsaved). */
export const stable = (v: unknown): string => JSON.stringify(v, (_k, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : 1))) : x));
import type { BusinessHours, DayHours, Vendor } from "../lib/types";

export const DEFAULT_DAYS: DayHours[] = [0, 1, 2, 3, 4, 5, 6].map((d) => ({ open: d >= 1 && d <= 5, start: "08:00", end: "17:00" }));
export const DEFAULT_HOURS: Required<BusinessHours> = { days: DEFAULT_DAYS, job_minutes: 120, buffer_minutes: 30, notice_hours: 24, max_days: 30, tz: (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Los_Angeles"; } catch { return "America/Los_Angeles"; } })() };
export const hoursOf = (h?: BusinessHours): Required<BusinessHours> => ({ ...DEFAULT_HOURS, ...(h ?? {}), days: (h?.days?.length === 7 ? h.days : DEFAULT_DAYS) });
const is24 = (d: DayHours) => d.start === "00:00" && d.end === "23:59";
const DAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Preset vendors, picked from a list when writing a purchase order. */
export function VendorsCard() {
  const { store, business, refresh } = useData();
  const toast = useToast();
  const [rows, setRows] = useState<Vendor[]>(business.vendors ?? []);
  const clean = rows.filter((v) => v.name.trim());
  const dirty = JSON.stringify(clean.map((v) => [v.name.trim(), v.phone ?? "", v.email ?? ""])) !== JSON.stringify((business.vendors ?? []).map((v) => [v.name, v.phone ?? "", v.email ?? ""]));
  useRegisterSave("vendors", dirty, async () => {
    try { await store.saveBusiness({ vendors: clean.map((v) => ({ name: v.name.trim(), phone: v.phone?.trim() || undefined, email: v.email?.trim() || undefined })) }); await refresh(); toast("Vendors saved"); }
    catch (e) { toast(errMsg(e, "Could not save vendors. Run the latest database update first.")); }
  });
  const set = (i: number, p: Partial<Vendor>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...p } : r)));
  return (
    <details className="card fold">
      <summary><span className="card-title">Vendors</span><span className="small muted">Preset suppliers for purchase orders</span></summary>
      <div className="stack">
        <p className="small muted" style={{ margin: 0 }}>Add the places you buy from once. When you write a purchase order you pick from this list instead of typing it every time.</p>
        {rows.map((v, i) => (
          <div key={i} className="opt-group">
            <div className="grid2 stack-sm">
              <Field label="Vendor name"><input className="input" value={v.name} onChange={(e) => set(i, { name: e.target.value })} placeholder="Ferguson" /></Field>
              <Field label="Phone (optional)"><input className="input" inputMode="tel" value={v.phone ?? ""} onChange={(e) => set(i, { phone: e.target.value })} /></Field>
            </div>
            <Field label="Email (optional)"><input className="input" type="email" value={v.email ?? ""} onChange={(e) => set(i, { email: e.target.value })} /></Field>
            <div><button type="button" className="btn sm danger" onClick={() => setRows(rows.filter((_, j) => j !== i))}>Remove</button></div>
          </div>
        ))}
        {!rows.length && <div className="small muted">No vendors yet.</div>}
        <div><button type="button" className="btn" onClick={() => setRows([...rows, { name: "" }])}>+ Add a vendor</button></div>
      </div>
    </details>
  );
}

/** Open hours and booking rules. Customers can only pick times inside these hours. */
export function HoursCard() {
  const { store, business, refresh } = useData();
  const toast = useToast();
  const [h, setH] = useState(() => hoursOf(business.hours));
  const dirty = stable(h) !== stable(hoursOf(business.hours));
  useRegisterSave("hours", dirty, async () => {
    try { await store.saveBusiness({ hours: h }); await refresh(); toast("Open hours saved"); }
    catch (e) { toast(errMsg(e, "Could not save hours. Run the latest database update first.")); }
  });
  const day = (i: number, p: Partial<DayHours>) => setH({ ...h, days: h.days.map((d, j) => (j === i ? { ...d, ...p } : d)) });
  const num = (k: "job_minutes" | "buffer_minutes" | "notice_hours" | "max_days", v: string) => setH({ ...h, [k]: Math.max(0, parseInt(v.replace(/\D/g, ""), 10) || 0) });
  return (
    <details className="card fold">
      <summary><span className="card-title">Open hours and booking</span><span className="small muted">When customers can book you</span></summary>
      <div className="stack">
        <p className="small muted" style={{ margin: 0 }}>After a customer accepts an estimate they pick a time. They only see times inside these hours that do not overlap a job already on your calendar.</p>
        <div className="opt-group">
          <h4>Open hours</h4>
          <div className="row wrap" style={{ gap: 8 }}>
            <button type="button" className="btn sm" onClick={() => setH({ ...h, days: h.days.map(() => ({ open: true, start: "00:00", end: "23:59" })) })}>Open 24/7</button>
            <button type="button" className="btn sm" onClick={() => setH({ ...h, days: DEFAULT_DAYS })}>Weekdays 8 to 5</button>
          </div>
          {h.days.map((d, i) => (
            <div key={i} className="row wrap" style={{ gap: 10 }}>
              <label className="row" style={{ width: 120 }}><input type="checkbox" checked={d.open} onChange={(e) => day(i, { open: e.target.checked })} /> <b>{DAY[i]}</b></label>
              {d.open && is24(d) ? <span className="small">Open 24 hours</span> : d.open ? (<><input className="input" style={{ width: 150 }} type="time" value={d.start} onChange={(e) => day(i, { start: e.target.value })} /><span className="muted">to</span><input className="input" style={{ width: 150 }} type="time" value={d.end} onChange={(e) => day(i, { end: e.target.value })} /></>) : <span className="muted small">Closed</span>}
              {d.open && <label className="row small" style={{ gap: 6 }}><input type="checkbox" checked={is24(d)} onChange={(e) => day(i, e.target.checked ? { start: "00:00", end: "23:59" } : { start: "08:00", end: "17:00" })} /> 24 hours</label>}
            </div>
          ))}
        </div>
        <div className="opt-group">
          <h4>Booking rules</h4>
          <div className="grid2 stack-sm">
            <Field label="Default visit length (minutes)"><input className="input" inputMode="numeric" value={h.job_minutes} onChange={(e) => num("job_minutes", e.target.value)} /></Field>
            <Field label="Gap between jobs (minutes)"><input className="input" inputMode="numeric" value={h.buffer_minutes} onChange={(e) => num("buffer_minutes", e.target.value)} /></Field>
            <Field label="Minimum notice (hours)"><input className="input" inputMode="numeric" value={h.notice_hours} onChange={(e) => num("notice_hours", e.target.value)} /></Field>
            <Field label="Time zone"><select className="input" value={h.tz} onChange={(e) => setH({ ...h, tz: e.target.value })}>{[...new Set([h.tz, "America/New_York", "America/Chicago", "America/Denver", "America/Phoenix", "America/Los_Angeles", "America/Anchorage", "Pacific/Honolulu"])].map((z) => <option key={z}>{z}</option>)}</select></Field>
            <Field label="Book up to (days ahead)"><input className="input" inputMode="numeric" value={h.max_days} onChange={(e) => num("max_days", e.target.value)} /></Field>
          </div>
        </div>
      </div>
    </details>
  );
}

const REMIND: [number, string][] = [[0, "Off"], [1, "1 hour before"], [2, "2 hours before"], [4, "4 hours before"], [12, "12 hours before"], [24, "1 day before"], [48, "2 days before"], [72, "3 days before"], [168, "1 week before"]];

/** Who is told when a customer books a time or a job is moved. */
export function NotifyCard() {
  const { store, business, refresh } = useData();
  const toast = useToast();
  const [email, setEmail] = useState(business.notify_email ?? "");
  const [phone, setPhone] = useState(business.notify_phone ?? "");
  const [custH, setCustH] = useState(business.reminders?.customer_hours ?? 24);
  const [teamH, setTeamH] = useState(business.reminders?.team_hours ?? 24);
  const dirty = email.trim() !== (business.notify_email ?? "") || phone.trim() !== (business.notify_phone ?? "") || custH !== (business.reminders?.customer_hours ?? 24) || teamH !== (business.reminders?.team_hours ?? 24);
  useRegisterSave("notify", dirty, async () => {
    try { await store.saveBusiness({ notify_email: email.trim(), notify_phone: phone.trim(), reminders: { customer_hours: custH, team_hours: teamH } }); await refresh(); toast("Notification settings saved"); }
    catch (e) { toast(errMsg(e, "Could not save. Run the latest database update first.")); }
  });
  return (
    <details className="card fold">
      <summary><span className="card-title">Notifications</span><span className="small muted">Who hears about bookings and changes</span></summary>
      <div className="stack">
        <p className="small muted" style={{ margin: 0 }}>When a customer books a time, or anyone moves a job, everyone on your account sees it under the bell in the app. It is also emailed here.</p>
        <Field label="Notification email"><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={business.email || "you@company.com"} /></Field>
        <div className="opt-group">
          <h4>Visit reminders</h4>
          <div className="grid2 stack-sm">
            <Field label="Remind the customer"><select className="select" value={custH} onChange={(e) => setCustH(Number(e.target.value))}>{REMIND.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
            <Field label="Remind the employee and your team"><select className="select" value={teamH} onChange={(e) => setTeamH(Number(e.target.value))}>{REMIND.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
          </div>
          <div className="small muted">Reminders go out by email, and by text once texting is set up. They run hourly, so timing is within the hour.</div>
        </div>
        <Field label="Text alerts to (optional)"><input className="input" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(916) 555-0100" /></Field>
      </div>
    </details>
  );
}
