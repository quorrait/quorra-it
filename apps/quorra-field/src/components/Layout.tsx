import { NavLink, Outlet } from "react-router-dom";
import { Icon } from "./ui";
import { APP_NAME } from "../lib/config";
import { useData } from "../lib/app";
import type { Feature } from "../lib/access";
import type { ReactNode } from "react";

interface NavItem { to: string; label: string; icon: ReactNode; end?: boolean; f?: Feature }

const LINKS: NavItem[] = [
  { to: "/", label: "Home", icon: Icon.home, end: true },
  { f: "calendar", to: "/calendar", label: "Calendar", icon: Icon.cal },
  { f: "jobs", to: "/jobs", label: "Jobs", icon: Icon.jobs },
  { f: "invoices", to: "/invoices", label: "Invoices", icon: Icon.invoice },
];

export const GROUPS: { title: string; links: NavItem[] }[] = [
  { title: "", links: LINKS.slice(0, 2) },
  { title: "Sales", links: [
    { f: "leads", to: "/leads", label: "Leads", icon: Icon.users, end: false },
    { f: "estimates", to: "/estimates", label: "Estimates", icon: Icon.invoice, end: false },
    { f: "pricebook", to: "/pricebook", label: "Price book", icon: Icon.card, end: false },
  ] },
  { title: "Work", links: [
    LINKS[2], LINKS[3],
    { f: "plans", to: "/plans", label: "Service plans", icon: Icon.cal, end: false },
    { f: "purchase_orders", to: "/purchase-orders", label: "Purchase orders", icon: Icon.jobs, end: false },
  ] },
  { title: "Manage", links: [
    { f: "customers", to: "/customers", label: "Customers", icon: Icon.users, end: false },
    { f: "team", to: "/team", label: "Team", icon: Icon.users, end: false },
    { f: "timesheets", to: "/timesheets", label: "Timesheets", icon: Icon.cal, end: false },
    { f: "reports", to: "/reports", label: "Reports", icon: Icon.invoice, end: false },
    { f: "settings", to: "/settings", label: "Settings", icon: Icon.gear, end: false },
  ] },
];

export default function Layout() {
  const { store, business, error, can, me, viewAs, team } = useData();
  const mine = (l: NavItem) => !l.f || can(l.f);
  return (
    <div className="shell">
      <aside className="side">
        <div className="side-brand">
          <img className="logo-mark" src={`${import.meta.env.BASE_URL}logo.png`} alt="" />
          {APP_NAME}
        </div>
        {GROUPS.map((g) => ({ ...g, links: g.links.filter(mine) })).filter((g) => g.links.length).map((g) => (
          <div key={g.title}>
            {g.title && <div className="nav-sec">{g.title}</div>}
            {g.links.map((l) => (
              <NavLink key={l.to} to={l.to} end={l.end} className={({ isActive }) => `side-link${isActive ? " active" : ""}`}>
                {l.icon}
                {l.label}
              </NavLink>
            ))}
          </div>
        ))}
        <div className="side-foot">
          {business.name}
          <div>{me.name} · {me.role}</div>
          {store.mode === "demo" && (
            <select className="select" style={{ marginTop: 8, height: 34, fontSize: 12 }} value={me.id ?? ""} onChange={(e) => viewAs(e.target.value)} aria-label="View as">
              {team.filter((t) => t.active).map((t) => <option key={t.id} value={t.id}>View as: {t.name} ({t.role})</option>)}
            </select>
          )}
        </div>
      </aside>

      <main className="main">
        {error && <div className="error-banner">{error}</div>}
        <Outlet />
      </main>

      <nav className="tabbar" aria-label="Main">
        {LINKS.filter(mine).map((l) => (
          <NavLink key={l.to} to={l.to} end={l.end} className={({ isActive }) => `tab${isActive ? " active" : ""}`}>
            {l.icon}
            {l.label}
          </NavLink>
        ))}
        <NavLink to="/more" className={({ isActive }) => `tab${isActive ? " active" : ""}`}>
          {Icon.more}
          More
        </NavLink>
      </nav>
    </div>
  );
}
