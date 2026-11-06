import { NavLink, Outlet } from "react-router-dom";
import { Icon } from "./ui";
import { APP_NAME } from "../lib/config";
import { useData } from "../lib/app";

const LINKS = [
  { to: "/", label: "Home", icon: Icon.home, end: true },
  { to: "/calendar", label: "Calendar", icon: Icon.cal },
  { to: "/jobs", label: "Jobs", icon: Icon.jobs },
  { to: "/invoices", label: "Invoices", icon: Icon.invoice },
];

export const GROUPS = [
  { title: "", links: LINKS.slice(0, 2) },
  { title: "Sales", links: [
    { to: "/leads", label: "Leads", icon: Icon.users, end: false },
    { to: "/estimates", label: "Estimates", icon: Icon.invoice, end: false },
    { to: "/pricebook", label: "Price book", icon: Icon.card, end: false },
  ] },
  { title: "Work", links: [
    LINKS[2], LINKS[3],
    { to: "/plans", label: "Service plans", icon: Icon.cal, end: false },
    { to: "/purchase-orders", label: "Purchase orders", icon: Icon.jobs, end: false },
  ] },
  { title: "Manage", links: [
    { to: "/customers", label: "Customers", icon: Icon.users, end: false },
    { to: "/team", label: "Team", icon: Icon.users, end: false },
    { to: "/timesheets", label: "Timesheets", icon: Icon.cal, end: false },
    { to: "/reports", label: "Reports", icon: Icon.invoice, end: false },
    { to: "/settings", label: "Settings", icon: Icon.gear, end: false },
  ] },
];

export default function Layout() {
  const { store, business, error } = useData();
  return (
    <div className="shell">
      <aside className="side">
        <div className="side-brand">
          <span className="logo-mark">Q</span>
          {APP_NAME}
        </div>
        {GROUPS.map((g) => (
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
          {store.mode === "demo" && <div>Demo mode</div>}
        </div>
      </aside>

      <main className="main">
        {error && <div className="error-banner">{error}</div>}
        <Outlet />
      </main>

      <nav className="tabbar" aria-label="Main">
        {LINKS.map((l) => (
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
