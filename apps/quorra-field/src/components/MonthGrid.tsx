import { useMemo } from "react";
import type { Job } from "../lib/types";
import { addDays, fmtDayShort, fmtTime, sameDay, startOfDay, startOfMonth, startOfWeek } from "../lib/dates";

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Month grid showing jobs per day. Dots on phones, job chips on wider screens. */
export default function MonthGrid({ month, jobs, selected, onSelect }: {
  month: Date;
  jobs: Job[];
  selected: Date | null;
  onSelect(d: Date): void;
}) {
  const byDay = useMemo(() => {
    const m = new Map<number, Job[]>();
    for (const j of jobs) {
      if (j.status === "canceled") continue;
      const k = startOfDay(new Date(j.start_at)).getTime();
      const arr = m.get(k) ?? [];
      arr.push(j);
      m.set(k, arr);
    }
    for (const arr of m.values()) arr.sort((a, b) => a.start_at.localeCompare(b.start_at));
    return m;
  }, [jobs]);

  const first = startOfMonth(month);
  const gridStart = startOfWeek(first);
  let cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  if (cells[35].getMonth() !== first.getMonth()) cells = cells.slice(0, 35); // skip an all-empty last row

  return (
    <div className="cal-grid">
      {DOW.map((d) => <div key={d} className="cal-dow">{d}</div>)}
      {cells.map((d) => {
        const js = byDay.get(startOfDay(d).getTime()) ?? [];
        const cls = [
          "cal-day",
          d.getMonth() !== first.getMonth() ? "other" : "",
          sameDay(d, new Date()) ? "today" : "",
          selected && sameDay(d, selected) ? "sel" : "",
        ].join(" ");
        return (
          <button key={d.getTime()} className={cls} onClick={() => onSelect(d)} aria-label={`${fmtDayShort(d)}, ${js.length} job${js.length === 1 ? "" : "s"}`}>
            <span className="cal-num">{d.getDate()}</span>
            <span className="cal-dots">
              {js.slice(0, 5).map((j) => <span key={j.id} className={`dot ${j.status}`} />)}
            </span>
            {js.slice(0, 3).map((j) => (
              <span key={j.id} className={`cal-chip ${j.status}`}>{fmtTime(j.start_at).replace(":00", "")} {j.title}</span>
            ))}
            {js.length > 3 && <span className="small muted">+{js.length - 3} more</span>}
          </button>
        );
      })}
    </div>
  );
}
