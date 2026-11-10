import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useData } from "../lib/app";
import { balanceDue, invoiceTotals, isOverdue, money, moneyShort } from "../lib/money";
import { dailySeries, earningsSummary, monthlySeries, weeklySeries } from "../lib/stats";
import { addDays, addMonths, fmtDayShort, fmtDuration, quotedMinutes, fmtMonth, fmtTime, sameDay, startOfDay } from "../lib/dates";
import { BarChart, JobBadge, Sheet, Spinner } from "../components/ui";
import CalendarSync from "../components/CalendarSync";
import MonthGrid from "../components/MonthGrid";
import JobForm from "../components/JobForm";

const dayWord = (d: Date) => {
  const t = startOfDay(new Date());
  if (sameDay(d, t)) return "Today";
  if (sameDay(d, addDays(t, 1))) return "Tomorrow";
  return fmtDayShort(d);
};

function delta(now: number, prev: number, label: string) {
  if (prev <= 0) return null;
  const diff = now - prev;
  const pct = Math.round((Math.abs(diff) / prev) * 100);
  const amount = pct > 200 ? money(Math.abs(diff)) : `${pct}%`;
  const word = diff === 0 ? "Same as" : `${diff > 0 ? "Up" : "Down"} ${amount} from`;
  return <span className={`delta ${diff >= 0 ? "up" : "down"}`}>{word} {label}</span>;
}

export default function Dashboard() {
  const { loading, business, jobs, invoices, payments, customerById, can } = useData();
  const money_ = can("money");
  const nav = useNavigate();
  const [range, setRange] = useState<"day" | "week" | "month">("day");

  const sum = useMemo(() => earningsSummary(payments), [payments]);
  const series = useMemo(
    () => (range === "day" ? dailySeries(payments, 14) : range === "week" ? weeklySeries(payments, 8) : monthlySeries(payments, 6)),
    [payments, range],
  );

  const today = new Date();
  const [syncOpen, setSyncOpen] = useState(false);
  const [month, setMonth] = useState(() => startOfDay(new Date()));
  const [picked, setPicked] = useState<Date | null>(null);
  const [adding, setAdding] = useState<Date | null>(null);

  // Jobs that haven't finished yet, soonest first. The first one is "Next job".
  const upcoming = jobs
    .filter((j) => (j.status === "scheduled" || j.status === "in_progress") && new Date(j.end_at).getTime() >= Date.now())
    .sort((a, b) => a.start_at.localeCompare(b.start_at));
  const nextJob = upcoming[0];
  const pickedJobs = picked
    ? jobs.filter((j) => sameDay(new Date(j.start_at), picked) && j.status !== "canceled").sort((a, b) => a.start_at.localeCompare(b.start_at))
    : null;
  const panelJobs = (pickedJobs ?? upcoming.slice(nextJob ? 1 : 0)).slice(0, 8);

  const open = invoices.filter((i) => i.status === "sent");
  const outstanding = open.reduce((s, i) => s + balanceDue(i, payments), 0);
  const overdue = open.filter((i) => isOverdue(i, payments));
  const overdueAmt = overdue.reduce((s, i) => s + balanceDue(i, payments), 0);

  const completed = jobs.filter((j) => j.status === "completed").sort((a, b) => b.end_at.localeCompare(a.end_at)).slice(0, 5);
  const invById = new Map(invoices.map((i) => [i.id, i]));
  const recent = [...payments].sort((a, b) => b.paid_at.localeCompare(a.paid_at)).slice(0, 5);

  if (loading) return <Spinner />;

  const hour = today.getHours();
  const greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1 className="page-title">{greet}</h1>
          <p className="page-sub">{business.name} · {fmtDayShort(today)}</p>
        </div>
        <Link to="/jobs?new=1" className="btn primary">+ New job</Link>
      </div>

      {money_ && <div className="earn-grid">
        <div className="earn hero">
          <div className="lbl">Earned today</div>
          <div className="amt num">{money(sum.today)}</div>
          {delta(sum.today, sum.yesterday, "yesterday")}
        </div>
        <div className="earn">
          <div className="lbl muted">This week</div>
          <div className="amt num">{money(sum.week)}</div>
        </div>
        <div className="earn">
          <div className="lbl muted">This month</div>
          <div className="amt num">{money(sum.month)}</div>
          {delta(sum.month, sum.lastMonth, "same days last month")}
        </div>
      </div>}

      <div className="home-cal">
        <div className="card flush">
          <div className="row between wrap" style={{ padding: "14px 16px", gap: 10 }}>
            <div className="bold" style={{ fontSize: 18 }}>{fmtMonth(month)}</div>
            <div className="row" style={{ flexWrap: "wrap" }}>
              <button className="btn sm" onClick={() => setMonth(addMonths(month, -1))} aria-label="Previous month">‹</button>
              <button className="btn sm" onClick={() => { setMonth(startOfDay(new Date())); setPicked(null); }}>Today</button>
              <button className="btn sm" onClick={() => setMonth(addMonths(month, 1))} aria-label="Next month">›</button>
              <button className="btn sm" onClick={() => setSyncOpen(true)}>Sync phone</button>
            </div>
          </div>
          <MonthGrid
            month={month}
            jobs={jobs}
            selected={picked}
            onSelect={(d) => setPicked(picked && sameDay(picked, d) ? null : d)}
          />
        </div>

        <div className="stack">
          {!picked && nextJob && (
            <div className="card next-job" onClick={() => nav(`/jobs/${nextJob.id}`)}>
              <div className="lbl">{nextJob.status === "in_progress" ? "In progress now" : "Next job"}</div>
              <div className="when">{dayWord(new Date(nextJob.start_at))} · {fmtTime(nextJob.start_at)}</div>
              <div className="what">{nextJob.title}</div>
              <div className="where copy">{customerById(nextJob.customer_id)?.name} · {nextJob.address}</div>
            </div>
          )}

          <div className="card flush">
            <div className="row between" style={{ padding: "14px 16px 6px" }}>
              <div className="card-title" style={{ margin: 0 }}>{picked ? fmtDayShort(picked) : "Coming up"}</div>
              {picked && (
                <div className="row">
                  <button className="btn sm primary" onClick={() => setAdding(new Date(picked.getFullYear(), picked.getMonth(), picked.getDate(), 9))}>+ New job</button>
                  <button className="btn sm" onClick={() => setPicked(null)}>Upcoming</button>
                </div>
              )}
            </div>
            {panelJobs.length === 0 && <div className="empty">{picked ? "No jobs this day" : "Nothing else scheduled"}</div>}
            <div className="list">
              {panelJobs.map((j) => {
                const d = new Date(j.start_at);
                return (
                  <div key={j.id} className="list-item" onClick={() => nav(`/jobs/${j.id}`)}>
                    <div className={`date-chip${sameDay(d, new Date()) ? " today" : ""}`}>
                      <small>{d.toLocaleDateString("en-US", { month: "short" })}</small>
                      <b>{d.getDate()}</b>
                    </div>
                    <div className="grow">
                      <div className="title">{j.title}</div>
                      <div className="small muted">{dayWord(d)} · {fmtTime(j.start_at)} · {customerById(j.customer_id)?.name}</div>
                    </div>
                    {picked && <JobBadge status={j.status} />}
                  </div>
                );
              })}
            </div>
            <div style={{ padding: "10px 16px", borderTop: "1px solid var(--line)" }}>
              <Link to="/calendar" className="small bold" style={{ color: "var(--brand)" }}>Full calendar →</Link>
            </div>
          </div>
        </div>
      </div>

      <div className="card flush">
        <div className="row between" style={{ padding: "16px 16px 6px" }}>
          <div className="card-title" style={{ margin: 0 }}>Recent completed jobs</div>
          <Link to="/jobs" className="small bold" style={{ color: "var(--brand)" }}>All jobs →</Link>
        </div>
        {completed.length === 0 && <div className="empty">No completed jobs yet</div>}
        <div className="list">
          {completed.map((j) => {
            const d = new Date(j.end_at);
            const billed = invoices.some((i) => i.job_id === j.id && i.status !== "void");
            return (
              <div key={j.id} className="list-item" onClick={() => nav(`/jobs/${j.id}`)}>
                <div className="date-chip">
                  <small>{d.toLocaleDateString("en-US", { month: "short" })}</small>
                  <b>{d.getDate()}</b>
                </div>
                <div className="grow">
                  <div className="title">{j.title}</div>
                  <div className="small muted">{customerById(j.customer_id)?.name}{j.assigned_to ? ` · ${j.assigned_to}` : ""}</div>
                  {j.actual_minutes != null && <div className="small muted">Quoted {fmtDuration(quotedMinutes(j))} · Took {fmtDuration(j.actual_minutes)}</div>}
                </div>
                {can("invoices") && <span className={`badge ${billed ? "good" : "gray"}`}>{billed ? "Invoiced" : "Not invoiced"}</span>}
              </div>
            );
          })}
        </div>
      </div>

      {money_ && (
        <>
      <div className="card">
        <div className="row between" style={{ marginBottom: 8 }}>
          <div className="card-title" style={{ margin: 0 }}>Revenue</div>
          <div className="seg" role="tablist">
            {(["day", "week", "month"] as const).map((r) => (
              <button key={r} className={range === r ? "on" : ""} onClick={() => setRange(r)}>
                {r === "day" ? "Daily" : r === "week" ? "Weekly" : "Monthly"}
              </button>
            ))}
          </div>
        </div>
        <BarChart data={series} />
      </div>

      <div className="grid2 stack-sm">
        <div className="card" style={{ cursor: "pointer" }} onClick={() => nav("/invoices?f=unpaid")}>
          <div className="card-title">Outstanding</div>
          <div className="bold num" style={{ fontSize: 28 }}>{money(outstanding)}</div>
          <div className="small muted">{open.length} unpaid invoice{open.length === 1 ? "" : "s"}</div>
          {overdue.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <span className="badge bad">{overdue.length} overdue · {moneyShort(overdueAmt)}</span>
            </div>
          )}
        </div>
        <div className="card flush">
          <div className="card-title" style={{ padding: "16px 16px 0" }}>Recent payments</div>
          {recent.length === 0 && <div className="empty">No payments yet</div>}
          <div className="list">
            {recent.map((p) => {
              const inv = invById.get(p.invoice_id);
              const c = inv ? customerById(inv.customer_id) : undefined;
              return (
                <div key={p.id} className="list-item" onClick={() => inv && nav(`/invoices/${inv.id}`)}>
                  <div className="grow">
                    <div className="title">{c?.name ?? "Customer"}</div>
                    <div className="small muted">{p.method} · {fmtDayShort(new Date(p.paid_at))}</div>
                  </div>
                  <div className="bold num">{money(p.amount_cents)}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

        </>
      )}

      {adding && <JobForm defaultStart={adding} onClose={() => setAdding(null)} onSaved={(j) => setPicked(startOfDay(new Date(j.start_at)))} />}
      {syncOpen && <Sheet title="Sync to your phone calendar" onClose={() => setSyncOpen(false)}><CalendarSync /></Sheet>}
    </div>
  );
}
