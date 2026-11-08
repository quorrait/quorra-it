import { useLocation, useNavigate } from "react-router-dom";
import { useData } from "../lib/app";

/** Leads, quotes and jobs are one pipeline, so they share one tab strip. */
export default function WorkTabs() {
  const { pathname } = useLocation();
  const nav = useNavigate();
  const { can } = useData();
  const tabs = [
    { to: "/leads", label: "Leads", f: "leads" },
    { to: "/estimates", label: "Quotes", f: "estimates" },
    { to: "/jobs", label: "Jobs", f: "jobs" },
  ] as const;
  return (
    <div className="chips" style={{ marginBottom: 12 }}>
      {tabs.filter((t) => can(t.f as never)).map((t) => (
        <button key={t.to} className={`chip${pathname.startsWith(t.to) ? " on" : ""}`} onClick={() => nav(t.to)}>{t.label}</button>
      ))}
    </div>
  );
}
