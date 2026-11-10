import { useEffect, useState } from "react";
import { useData } from "../lib/app";
import { errMsg } from "../lib/errors";
import { money } from "../lib/money";
import { addDays, fmtDayShort, fmtTime, startOfWeek } from "../lib/dates";
import { Field, Sheet, Spinner, useToast } from "../components/ui";
import type { PayPeriod } from "../lib/types";
import { isManager } from "../lib/access";
import type { TimeEntry } from "../lib/types";
import { initials } from "./Team";

const hrs = (ms: number) => ms / 3600_000;
const OT_RATE = 1.5;
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const PERIOD_NAMES: Record<NonNullable<PayPeriod["type"]>, string> = { weekly: "Weekly", biweekly: "Every 2 weeks", semimonthly: "Twice a month (1st-15th, 16th-end)", monthly: "Monthly", custom: "Custom dates" };
/** The pay period that is `offset` periods before the current one. End is exclusive. */
function periodFor(offset: number, pp: PayPeriod | undefined, now = new Date()): { start: Date; end: Date } {
  const type = pp?.type ?? "weekly";
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (type === "custom" && pp?.from && pp?.to) {
    const f = new Date(pp.from + "T00:00:00"), t = addDays(new Date(pp.to + "T00:00:00"), 1);
    const span = Math.max(1, Math.round((t.getTime() - f.getTime()) / 86400000));
    return { start: addDays(f, offset * span), end: addDays(t, offset * span) };
  }
  if (type === "monthly") { const s = new Date(day.getFullYear(), day.getMonth() + offset, 1); return { start: s, end: new Date(s.getFullYear(), s.getMonth() + 1, 1) }; }
  if (type === "semimonthly") {
    const idx = day.getFullYear() * 24 + day.getMonth() * 2 + (day.getDate() >= 16 ? 1 : 0) + offset; // counts half-months
    const y = Math.floor(idx / 24), mo = Math.floor((idx % 24) / 2), half = idx % 2;
    return half === 0 ? { start: new Date(y, mo, 1), end: new Date(y, mo, 16) } : { start: new Date(y, mo, 16), end: new Date(y, mo + 1, 1) };
  }
  const len = type === "biweekly" ? 14 : 7;
  const a = pp?.anchor ? new Date(pp.anchor + "T00:00:00") : startOfWeek(new Date());
  const n = Math.floor((day.getTime() - a.getTime()) / 86400000 / len);
  const start = addDays(a, (n + offset) * len);
  return { start, end: addDays(start, len) };
}
const toLocal = (iso: string) => { const d = new Date(iso); const p = (n: number) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
const stamp = (iso: string | null) => (iso ? new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "still clocked in");
const otH = (t: { overtime_minutes?: number }) => (t.overtime_minutes ?? 0) / 60;
interface Form { id?: string; member_id: string; job_id: string; start: string; end: string; ot: string; note: string }
const dur = (ms: number) => `${Math.floor(ms / 3600_000)}h ${String(Math.floor((ms % 3600_000) / 60_000)).padStart(2, "0")}m`;

export default function Timesheets() {
  const { loading, team, timeEntries, jobs, store, refresh, me: user, business } = useData();
  const canEdit = isManager(user.role);
  const [form, setForm] = useState<Form | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const [who, setWho] = useState("");
  const [jobId, setJobId] = useState("");
  const [week, setWeek] = useState(0);
  const [ppOpen, setPpOpen] = useState(false);
  const [ppDraft, setPpDraft] = useState<PayPeriod>({});
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 30_000); return () => clearInterval(t); }, []);

  if (loading) return <Spinner />;
  const active = team.filter((m) => m.active);
  const me = who || active[0]?.id || "";
  const running = timeEntries.find((t) => t.member_id === me && !t.end_at);
  const { start, end } = periodFor(week, business.pay_period);
  const inWeek = timeEntries.filter((t) => new Date(t.start_at) >= start && new Date(t.start_at) < end);
  const ms = (t: { start_at: string; end_at: string | null }) => (t.end_at ? new Date(t.end_at) : new Date()).getTime() - new Date(t.start_at).getTime();

  async function clockIn() {
    await store.saveRow("time_entries", { member_id: me, job_id: jobId || null, start_at: new Date().toISOString(), end_at: null, note: "" });
    await refresh(); toast("Clocked in");
  }
  async function clockOut() {
    if (!running) return;
    await store.saveRow("time_entries", { ...running, end_at: new Date().toISOString() });
    await refresh(); toast("Clocked out");
  }

  const blank = (): Form => { const n = new Date(); const e = new Date(n.getTime()); n.setHours(8, 0, 0, 0); e.setHours(16, 0, 0, 0); return { member_id: me_(), job_id: "", start: toLocal(n.toISOString()), end: toLocal(e.toISOString()), ot: "0", note: "" }; };
  function me_() { return active.find((m) => m.id === who)?.id ?? active[0]?.id ?? ""; }
  const edit = (t: TimeEntry): Form => ({ id: t.id, member_id: t.member_id, job_id: t.job_id ?? "", start: toLocal(t.start_at), end: t.end_at ? toLocal(t.end_at) : "", ot: String(+(otH(t)).toFixed(2)), note: t.note ?? "" });

  async function saveForm() {
    if (!form) return;
    const start = new Date(form.start), endD = form.end ? new Date(form.end) : null;
    if (isNaN(start.getTime())) return toast("Enter a start time");
    if (endD && (isNaN(endD.getTime()) || endD <= start)) return toast("End time must be after the start time");
    const otMin = Math.max(0, Math.round((parseFloat(form.ot) || 0) * 60));
    if (endD && otMin > (endD.getTime() - start.getTime()) / 60000) return toast("Overtime can't be longer than the entry");
    const at = new Date().toISOString();
    setSaving(true);
    try {
      const next = { member_id: form.member_id, job_id: form.job_id || null, start_at: start.toISOString(), end_at: endD ? endD.toISOString() : null, overtime_minutes: otMin, note: form.note.trim() };
      if (form.id) {
        const old = timeEntries.find((t) => t.id === form.id)!;
        const nm = (id: string) => team.find((m) => m.id === id)?.name ?? "Unknown";
        const jn = (id: string | null) => jobs.find((j) => j.id === id)?.title ?? "No job";
        const changes: string[] = [];
        if (old.member_id !== next.member_id) changes.push(`Employee: ${nm(old.member_id)} → ${nm(next.member_id)}`);
        if (new Date(old.start_at).getTime() !== start.getTime()) changes.push(`Clock in: ${stamp(old.start_at)} → ${stamp(next.start_at)}`);
        if ((old.end_at ? new Date(old.end_at).getTime() : null) !== (endD ? endD.getTime() : null)) changes.push(`Clock out: ${stamp(old.end_at)} → ${stamp(next.end_at)}`);
        if ((old.overtime_minutes ?? 0) !== otMin) changes.push(`Overtime: ${((old.overtime_minutes ?? 0) / 60).toFixed(2)}h → ${(otMin / 60).toFixed(2)}h`);
        if ((old.job_id ?? null) !== next.job_id) changes.push(`Job: ${jn(old.job_id)} → ${jn(next.job_id)}`);
        if ((old.note ?? "") !== next.note) changes.push(`Note: "${old.note ?? ""}" → "${next.note}"`);
        if (!changes.length) { setForm(null); return; }
        await store.saveRow("time_entries", { ...old, ...next, edits: [...(old.edits ?? []), { by: user.name, at, changes }] });
        toast("Timesheet updated");
      } else {
        await store.saveRow("time_entries", { ...next, edits: [{ by: user.name, at, added: true, changes: [] }] });
        toast("Time added");
      }
      await refresh(); setForm(null);
    } catch (e) { toast(e instanceof Error ? e.message : "Could not save. Run the latest database update first."); }
    finally { setSaving(false); }
  }

  return (
    <div className="stack">
      <div className="page-head"><div><h1 className="page-title">Timesheets</h1><p className="page-sub">Clock in and out, see hours and labor cost.</p></div>{canEdit && <button className="btn primary" onClick={() => setForm(blank())}>Add time</button>}</div>

      <div className="card stack">
        <div className="grid2 stack-sm">
          <select className="select" value={me} onChange={(e) => setWho(e.target.value)}>{active.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
          <select className="select" value={jobId} onChange={(e) => setJobId(e.target.value)} disabled={!!running}>
            <option value="">No job</option>
            {jobs.filter((j) => j.status !== "completed" && j.status !== "canceled").map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}
          </select>
        </div>
        {running ? (
          <>
            <div className="notice">Clocked in since {fmtTime(running.start_at)} · {dur(ms(running))}</div>
            <button className="btn danger block" style={{ minHeight: 52 }} onClick={clockOut}>Clock out</button>
          </>
        ) : <button className="btn good block" style={{ minHeight: 52 }} onClick={clockIn} disabled={!me}>Clock in</button>}
      </div>

      <div className="row between">
        <button className="btn sm" onClick={() => setWeek(week - 1)}>‹ Prev</button>
        <b style={{ textAlign: "center" }}>{fmtDayShort(start)} – {fmtDayShort(addDays(end, -1))}<div className="small muted" style={{ fontWeight: 400 }}>{PERIOD_NAMES[business.pay_period?.type ?? "weekly"].split(" (")[0]} pay period{canEdit && <> · <button type="button" style={{ background: "none", border: 0, padding: 0, color: "var(--brand, #ea580c)", cursor: "pointer", font: "inherit" }} onClick={() => { setPpDraft(business.pay_period ?? {}); setPpOpen(true); }}>Change</button></>}</div></b>
        <button className="btn sm" onClick={() => setWeek(Math.min(0, week + 1))} disabled={week >= 0}>Next ›</button>
      </div>

      <div className="card flush">
        <table className="tbl tbl-cards">
          <thead><tr><th>Member</th><th className="r">Hours</th><th className="r">Overtime</th><th className="r">Labor cost</th></tr></thead>
          <tbody>
            {team.map((m) => {
              const mine = inWeek.filter((t) => t.member_id === m.id);
              if (!mine.length) return null;
              const h = hrs(mine.reduce((s, t) => s + ms(t), 0));
              const ot = Math.min(h, mine.reduce((s, t) => s + otH(t), 0));
              return <tr key={m.id}><td data-label="Member"><span className="row"><span className="avatar" style={{ background: m.color, width: 26, height: 26, fontSize: 11 }}>{initials(m.name)}</span>{m.name}</span></td><td className="r num" data-label="Hours">{h.toFixed(1)}</td><td className="r num" data-label="Overtime">{ot ? ot.toFixed(1) : "–"}</td><td className="r num" data-label="Labor cost">{money(Math.round((h - ot) * m.hourly_cents + ot * m.hourly_cents * OT_RATE))}</td></tr>;
            })}
            {inWeek.length === 0 && <tr><td colSpan={4} className="muted">No time logged this week</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="card flush">
        <div className="card-title" style={{ padding: "14px 16px 0" }}>Entries</div>
        <div className="list">
          {[...inWeek].sort((a, b) => b.start_at.localeCompare(a.start_at)).map((t) => {
            const ed = t.edits ?? [];
            const last = ed[ed.length - 1];
            return (
              <div key={t.id} className="list-item" style={{ flexWrap: "wrap" }}>
                <div className="grow">
                  <div className="title">{team.find((m) => m.id === t.member_id)?.name ?? "Unknown"}{otH(t) > 0 && <span className="pill" style={{ marginLeft: 8 }}>OT {otH(t).toFixed(1)}h</span>}</div>
                  <div className="small muted">{fmtDayShort(new Date(t.start_at))} · {fmtTime(t.start_at)} – {t.end_at ? fmtTime(t.end_at) : "now"} · {jobs.find((j) => j.id === t.job_id)?.title ?? "No job"}</div>
                  {last && <button type="button" className="small" style={{ background: "none", border: 0, padding: 0, color: "var(--brand, #ea580c)", cursor: "pointer", textAlign: "left" }} onClick={() => setOpen(open === t.id ? null : t.id)}>{last.added && ed.length === 1 ? `Added by ${last.by}` : `Edited by ${last.by}`} · {stamp(last.at)} {open === t.id ? "▴" : "▾"}</button>}
                </div>
                <div className="bold num">{dur(ms(t))}</div>
                {canEdit && <button className="btn sm" onClick={() => setForm(edit(t))}>Edit</button>}
                <button className="btn sm danger" onClick={async () => { await store.deleteRow("time_entries", t.id); await refresh(); }}>✕</button>
                {open === t.id && (
                  <div className="notice" style={{ flexBasis: "100%" }}>
                    {[...ed].reverse().map((e, i) => (
                      <div key={i} style={{ marginBottom: 6 }}>
                        <b>{e.added ? "Added" : "Edited"} by {e.by}</b> <span className="muted">{stamp(e.at)}</span>
                        {e.changes.map((c, j) => <div key={j} className="small">{c}</div>)}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      {form && (
        <Sheet title={form.id ? "Edit time entry" : "Add time"} onClose={() => setForm(null)}>
          <div className="stack">
            <Field label="Employee"><select className="select" value={form.member_id} onChange={(e) => setForm({ ...form, member_id: e.target.value })}>{team.filter((m) => m.active || m.id === form.member_id).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></Field>
            <Field label="Job"><select className="select" value={form.job_id} onChange={(e) => setForm({ ...form, job_id: e.target.value })}><option value="">No job</option>{jobs.map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}</select></Field>
            <div className="grid2 stack-sm">
              <Field label="Clock in"><input className="input" type="datetime-local" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} /></Field>
              <Field label="Clock out (blank = still in)"><input className="input" type="datetime-local" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} /></Field>
            </div>
            <Field label="Overtime hours in this entry (paid at 1.5x)"><input className="input" inputMode="decimal" value={form.ot} onChange={(e) => setForm({ ...form, ot: e.target.value })} /></Field>
            <Field label="Note"><input className="input" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Reason for the change (optional)" /></Field>
            {form.id && <div className="small muted">Every change is logged with your name and what changed.</div>}
            <button className="btn primary block" disabled={saving} onClick={() => void saveForm()}>{saving ? "Saving..." : form.id ? "Save changes" : "Add time"}</button>
          </div>
        </Sheet>
      )}
      {ppOpen && (
        <Sheet title="Pay period" onClose={() => setPpOpen(false)}>
          <div className="stack">
            <Field label="How often do you pay?">
              <select className="select" value={ppDraft.type ?? "weekly"} onChange={(e) => setPpDraft({ ...ppDraft, type: e.target.value as PayPeriod["type"] })}>
                {(Object.keys(PERIOD_NAMES) as (keyof typeof PERIOD_NAMES)[]).map((k) => <option key={k} value={k}>{PERIOD_NAMES[k]}</option>)}
              </select>
            </Field>
            {ppDraft.type === "custom" && (
              <div className="grid2 stack-sm">
                <Field label="First day"><input className="input" type="date" value={ppDraft.from ?? ""} onChange={(e) => setPpDraft({ ...ppDraft, from: e.target.value })} /></Field>
                <Field label="Last day"><input className="input" type="date" value={ppDraft.to ?? ""} onChange={(e) => setPpDraft({ ...ppDraft, to: e.target.value })} /></Field>
              </div>
            )}
            {(ppDraft.type ?? "weekly") !== "semimonthly" && (ppDraft.type ?? "weekly") !== "monthly" && ppDraft.type !== "custom" && (
              <Field label="A date a pay period starts on"><input className="input" type="date" value={ppDraft.anchor ?? iso(startOfWeek(new Date()))} onChange={(e) => setPpDraft({ ...ppDraft, anchor: e.target.value })} /></Field>
            )}
            <div className="small muted">Pick any start date from a past or current pay period. Every period is counted from it. Timesheets, hours and labor cost are grouped by this period.</div>
            <button className="btn primary block" onClick={async () => { if (ppDraft.type === "custom" && (!ppDraft.from || !ppDraft.to || ppDraft.to < ppDraft.from)) return toast("Pick a first and last day"); try { await store.saveBusiness({ pay_period: ppDraft }); await refresh(); setWeek(0); setPpOpen(false); toast("Pay period updated"); } catch (e) { toast(errMsg(e, "Could not save. Run database update 0016 first.")); } }}>Save pay period</button>
          </div>
        </Sheet>
      )}
    </div>
  );
}
