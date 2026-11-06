import { useEffect, useState } from "react";
import { useData } from "../lib/app";
import { money } from "../lib/money";
import { addDays, fmtDayShort, fmtTime, startOfWeek } from "../lib/dates";
import { Spinner, useToast } from "../components/ui";
import { initials } from "./Team";

const hrs = (ms: number) => ms / 3600_000;
const dur = (ms: number) => `${Math.floor(ms / 3600_000)}h ${String(Math.floor((ms % 3600_000) / 60_000)).padStart(2, "0")}m`;

export default function Timesheets() {
  const { loading, team, timeEntries, jobs, store, refresh } = useData();
  const toast = useToast();
  const [who, setWho] = useState("");
  const [jobId, setJobId] = useState("");
  const [week, setWeek] = useState(0);
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 30_000); return () => clearInterval(t); }, []);

  if (loading) return <Spinner />;
  const active = team.filter((m) => m.active);
  const me = who || active[0]?.id || "";
  const running = timeEntries.find((t) => t.member_id === me && !t.end_at);
  const start = addDays(startOfWeek(new Date()), week * 7);
  const end = addDays(start, 7);
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

  return (
    <div className="stack">
      <div className="page-head"><div><h1 className="page-title">Timesheets</h1><p className="page-sub">Clock in and out, see hours and labor cost.</p></div></div>

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
        <b>{fmtDayShort(start)} – {fmtDayShort(addDays(end, -1))}</b>
        <button className="btn sm" onClick={() => setWeek(Math.min(0, week + 1))} disabled={week >= 0}>Next ›</button>
      </div>

      <div className="card flush scroll-x">
        <table className="tbl">
          <thead><tr><th>Member</th><th className="r">Hours</th><th className="r">Labor cost</th></tr></thead>
          <tbody>
            {team.map((m) => {
              const mine = inWeek.filter((t) => t.member_id === m.id);
              if (!mine.length) return null;
              const h = hrs(mine.reduce((s, t) => s + ms(t), 0));
              return <tr key={m.id}><td><span className="row"><span className="avatar" style={{ background: m.color, width: 26, height: 26, fontSize: 11 }}>{initials(m.name)}</span>{m.name}</span></td><td className="r num">{h.toFixed(1)}</td><td className="r num">{money(Math.round(h * m.hourly_cents))}</td></tr>;
            })}
            {inWeek.length === 0 && <tr><td colSpan={3} className="muted">No time logged this week</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="card flush">
        <div className="card-title" style={{ padding: "14px 16px 0" }}>Entries</div>
        <div className="list">
          {[...inWeek].sort((a, b) => b.start_at.localeCompare(a.start_at)).map((t) => (
            <div key={t.id} className="list-item">
              <div className="grow">
                <div className="title">{team.find((m) => m.id === t.member_id)?.name ?? "Unknown"}</div>
                <div className="small muted">{fmtDayShort(new Date(t.start_at))} · {fmtTime(t.start_at)} – {t.end_at ? fmtTime(t.end_at) : "now"} · {jobs.find((j) => j.id === t.job_id)?.title ?? "No job"}</div>
              </div>
              <div className="bold num">{dur(ms(t))}</div>
              <button className="btn sm danger" onClick={async () => { await store.deleteRow("time_entries", t.id); await refresh(); }}>✕</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
