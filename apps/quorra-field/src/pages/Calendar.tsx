import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useData } from "../lib/app";
import { addDays, addMonths, fmtDayShort, fmtMonth, fmtTime, sameDay, startOfDay, startOfMonth, startOfWeek } from "../lib/dates";
import type { Job } from "../lib/types";
import { Icon, JobBadge, Spinner } from "../components/ui";
import JobForm from "../components/JobForm";
import MonthGrid from "../components/MonthGrid";

export default function Calendar() {
  const { loading, jobs, customerById } = useData();
  const nav = useNavigate();
  const [view, setView] = useState<"month" | "week">("month");
  const [cursor, setCursor] = useState(() => startOfDay(new Date()));
  const [selected, setSelected] = useState(() => startOfDay(new Date()));
  const [adding, setAdding] = useState<Date | null>(null);

  const byDay = useMemo(() => {
    const m = new Map<number, Job[]>();
    for (const j of jobs) {
      const k = startOfDay(new Date(j.start_at)).getTime();
      const arr = m.get(k) ?? [];
      arr.push(j);
      m.set(k, arr);
    }
    for (const arr of m.values()) arr.sort((a, b) => a.start_at.localeCompare(b.start_at));
    return m;
  }, [jobs]);
  const on = (d: Date) => byDay.get(startOfDay(d).getTime()) ?? [];

  const weekStart = startOfWeek(cursor);
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const step = (dir: number) => {
    if (view === "month") setCursor(addMonths(cursor, dir));
    else setCursor(addDays(cursor, dir * 7));
  };
  const goToday = () => {
    const t = startOfDay(new Date());
    setCursor(t);
    setSelected(t);
  };

  function JobRow({ j }: { j: Job }) {
    return (
      <div className="list-item" onClick={() => nav(`/jobs/${j.id}`)}>
        <div className="job-time num">{fmtTime(j.start_at)}<small>{j.assigned_to || "Unassigned"}</small></div>
        <div className="grow">
          <div className="title">{j.title}</div>
          <div className="small muted">{customerById(j.customer_id)?.name}</div>
        </div>
        <JobBadge status={j.status} />
      </div>
    );
  }

  if (loading) return <Spinner />;

  const defaultStart = (d: Date) => {
    const x = new Date(d);
    x.setHours(9, 0, 0, 0);
    return x;
  };

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1 className="page-title">{view === "month" ? fmtMonth(cursor) : `Week of ${fmtDayShort(weekStart)}`}</h1>
        </div>
        <div className="row wrap">
          <div className="seg">
            <button className={view === "month" ? "on" : ""} onClick={() => setView("month")}>Month</button>
            <button className={view === "week" ? "on" : ""} onClick={() => setView("week")}>Week</button>
          </div>
          <button className="btn sm" onClick={() => step(-1)} aria-label="Previous">‹</button>
          <button className="btn sm" onClick={goToday}>Today</button>
          <button className="btn sm" onClick={() => step(1)} aria-label="Next">›</button>
        </div>
      </div>

      {view === "month" ? (
        <>
          <div className="card flush">
            <MonthGrid month={cursor} jobs={jobs} selected={selected} onSelect={setSelected} />
          </div>

          <div className="card flush">
            <div className="row between" style={{ padding: "14px 16px" }}>
              <div className="bold">{fmtDayShort(selected)}</div>
              <button className="btn sm primary" onClick={() => setAdding(defaultStart(selected))}>{Icon.plus} Add job</button>
            </div>
            {on(selected).length === 0 && <div className="empty" style={{ borderTop: "1px solid var(--line)" }}>No jobs this day</div>}
            <div className="list">{on(selected).map((j) => <JobRow key={j.id} j={j} />)}</div>
          </div>
        </>
      ) : (
        <div>
          {weekDays.map((d) => (
            <div key={d.getTime()} className={`week-day${sameDay(d, new Date()) ? " today" : ""}`}>
              <div className="row between">
                <h3>{fmtDayShort(d)}</h3>
                <button className="btn sm" onClick={() => setAdding(defaultStart(d))}>{Icon.plus}</button>
              </div>
              <div className="card flush">
                {on(d).length === 0 && <div className="empty" style={{ padding: 14 }}>Open</div>}
                <div className="list">{on(d).map((j) => <JobRow key={j.id} j={j} />)}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {adding && <JobForm defaultStart={adding} onClose={() => setAdding(null)} onSaved={(j) => setSelected(startOfDay(new Date(j.start_at)))} />}
    </div>
  );
}
