import { useLocation, useNavigate } from "react-router-dom";
import { useData } from "../lib/app";

/** Leads, quotes and jobs are one pipeline, so they share one tab strip. */
export default function WorkTabs() {
  const { pathname } = useLocation();
  const nav = useNavigate();
  const { can } = useData();
  const tabs = [
    { to: "/leads", label: "Leads", f: "leads" },
    { to: "/estimates", label: "Estimates", f: "estimates" },
    { to: "/jobs", label: "Jobs", f: "jobs" },
  ] as const;
  return (
    <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
      {tabs.filter((t) => can(t.f as never)).map((t) => (
        <button key={t.to} className={`btn${pathname.startsWith(t.to) ? " primary" : ""}`} style={{ flex: 1, minHeight: 52, fontSize: 17, fontWeight: 700 }} onClick={() => nav(t.to)}>{t.label}</button>
      ))}
    </div>
  );
}
