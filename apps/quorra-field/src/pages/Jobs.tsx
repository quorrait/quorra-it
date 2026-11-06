import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useData } from "../lib/app";
import { fmtDayShort, fmtTime, sameDay } from "../lib/dates";
import { Icon, JobBadge, Spinner } from "../components/ui";
import JobForm from "../components/JobForm";

type Filter = "today" | "upcoming" | "active" | "done" | "all";

export default function Jobs() {
  const { loading, jobs, customerById } = useData();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const [filter, setFilter] = useState<Filter>("upcoming");
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (params.get("new")) setAdding(true);
  }, [params]);

  const now = new Date();
  const shown = useMemo(() => {
    const text = q.trim().toLowerCase();
    const list = jobs.filter((j) => {
      const d = new Date(j.start_at);
      if (filter === "today" && !sameDay(d, now)) return false;
      if (filter === "upcoming" && !(j.status === "scheduled" && d.getTime() >= new Date().setHours(0, 0, 0, 0))) return false;
      if (filter === "active" && j.status !== "in_progress") return false;
      if (filter === "done" && j.status !== "completed") return false;
      if (text) {
        const hay = `${j.title} ${j.address} ${customerById(j.customer_id)?.name ?? ""} ${j.assigned_to}`.toLowerCase();
        if (!hay.includes(text)) return false;
      }
      return true;
    });
    return list.sort((a, b) => (filter === "done" || filter === "all" ? b.start_at.localeCompare(a.start_at) : a.start_at.localeCompare(b.start_at)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs, filter, q]);

  if (loading) return <Spinner />;

  return (
    <div className="stack">
      <div className="page-head">
        <h1 className="page-title">Jobs</h1>
        <button className="btn primary" onClick={() => setAdding(true)}>{Icon.plus} New job</button>
      </div>

      <input className="input" placeholder="Search jobs, customers, addresses" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="chips">
        {([["upcoming", "Upcoming"], ["today", "Today"], ["active", "In progress"], ["done", "Completed"], ["all", "All"]] as [Filter, string][]).map(([k, label]) => (
          <button key={k} className={`chip${filter === k ? " on" : ""}`} onClick={() => setFilter(k)}>{label}</button>
        ))}
      </div>

      <div className="card flush">
        {shown.length === 0 && <div className="empty">No jobs match this filter</div>}
        <div className="list">
          {shown.slice(0, 80).map((j) => (
            <div key={j.id} className="list-item" onClick={() => nav(`/jobs/${j.id}`)}>
              <div className="job-time num" style={{ width: 78 }}>{fmtDayShort(new Date(j.start_at)).replace(/^\w+, /, "")}<small>{fmtTime(j.start_at)}</small></div>
              <div className="grow">
                <div className="title">{j.title}</div>
                <div className="small muted">{customerById(j.customer_id)?.name} · {j.address}</div>
              </div>
              <JobBadge status={j.status} />
            </div>
          ))}
        </div>
      </div>

      {adding && (
        <JobForm
          onClose={() => {
            setAdding(false);
            if (params.get("new")) setParams({}, { replace: true });
          }}
          onSaved={(j) => nav(`/jobs/${j.id}`)}
        />
      )}
    </div>
  );
}
