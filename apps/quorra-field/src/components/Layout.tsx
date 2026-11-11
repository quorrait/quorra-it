import { useHubAdmin } from "../lib/hub";
import Tour from "./Tour";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { applyStatusBar } from "../lib/native";
import { Icon, useConfirm } from "./ui";
import NotificationBell from "./NotificationBell";
import PublicFooter from "./PublicFooter";
import { canSaveUnsaved, clearUnsaved, hasUnsaved, saveUnsaved } from "../lib/unsaved";
import { APP_NAME } from "../lib/config";
import { PUBLIC_SITE_URL } from "../lib/publicUrl";
import { useData, useAuth } from "../lib/app";
import type { Feature } from "../lib/access";
import type { GatedFeature } from "../lib/plans";
import type { ReactNode } from "react";

interface NavItem { to: string; label: string; icon: ReactNode; end?: boolean; f?: Feature; gate?: GatedFeature }

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
    { f: "templates", to: "/templates", label: "Templates", icon: Icon.invoice, end: false },
  ] },
  { title: "Work", links: [
    LINKS[2], LINKS[3],
    { f: "plans", gate: "service_plans", to: "/service-plans", label: "Service plans", icon: Icon.cal, end: false },
    { f: "purchase_orders", gate: "purchase_orders", to: "/purchase-orders", label: "Purchase orders", icon: Icon.jobs, end: false },
  ] },
  { title: "Manage", links: [
    { f: "customers", to: "/customers", label: "Customers", icon: Icon.users, end: false },
    { f: "team", to: "/team", label: "Team", icon: Icon.users, end: false },
    { f: "timesheets", gate: "timesheets", to: "/timesheets", label: "Timesheets", icon: Icon.cal, end: false },
    { f: "reports", gate: "reports", to: "/reports", label: "Reports", icon: Icon.invoice, end: false },
    { f: "import", to: "/import", label: "Import", icon: Icon.send, end: false },
    { f: "settings", to: "/integrations", label: "Integrations", icon: Icon.plug, end: false },
    { f: "settings", to: "/settings", label: "Settings", icon: Icon.gear, end: false },
    { f: "billing", to: "/billing", label: "Billing", icon: Icon.card, end: false },
    { to: "/support", label: "Support", icon: Icon.send, end: false },
  ] },
];

export default function Layout() {
  const { store, business, error, can, allows, me, viewAs, team, leads, locked, loading } = useData();
  const { signOut } = useAuth();
  const nav = useNavigate();
  const ask = useConfirm();
  useEffect(() => { void applyStatusBar("app"); }, []);
  useEffect(() => {
    // Leaving a screen with unsaved changes (tab bar, side menu or any in-app link) asks first.
    const onClick = async (e: MouseEvent) => {
      if (!hasUnsaved() || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey) return;
      const a = (e.target as HTMLElement).closest("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin) return;
      const dest = url.hash.startsWith("#/") ? url.hash.slice(1) : url.pathname.replace(import.meta.env.BASE_URL.replace(/\/$/, ""), "") + url.search;
      if (dest === (location.hash.startsWith("#/") ? location.hash.slice(1) : location.pathname.replace(import.meta.env.BASE_URL.replace(/\/$/, ""), ""))) return;
      e.preventDefault(); e.stopPropagation();
      const canSave = canSaveUnsaved();
      const leave = await ask({ title: "Leave without saving?", message: "You have changes that are not saved. If you leave now they will be lost.", confirmLabel: "Leave without saving", cancelLabel: canSave ? "Save changes" : "Stay here", danger: true });
      if (leave) { clearUnsaved(); nav(dest || "/"); }
      else if (canSave) { try { await saveUnsaved(); clearUnsaved(); nav(dest || "/"); } catch { /* the save toast already explains; stay here */ } }
    };
    const onUnload = (e: BeforeUnloadEvent) => { if (hasUnsaved()) { e.preventDefault(); e.returnValue = ""; } };
    document.addEventListener("click", onClick, true);
    window.addEventListener("beforeunload", onUnload);
    return () => { document.removeEventListener("click", onClick, true); window.removeEventListener("beforeunload", onUnload); };
  }, [ask, nav]);
  const hubAdmin = useHubAdmin();
  const newLeads = leads.filter((l) => l.stage === "new").length;
  // Wait for the role to load before showing any menu, so the wrong menu never flashes.
  const mine = (l: NavItem) => (loading ? false : locked ? l.f === "billing" : !l.f || can(l.f));
  const planLocked = (l: NavItem) => Boolean(l.gate && !allows(l.gate));
  return (
    <div className="shell">
      <aside className="side">
        <div className="side-brand">
          <img className="logo-mark side-logo" src={`${import.meta.env.BASE_URL}logo-mark-v2.png`} alt="" />
          {APP_NAME}
        </div>
        {GROUPS.map((g) => ({ ...g, links: g.links.filter(mine) })).filter((g) => g.links.length).map((g) => (
          <div key={g.title}>
            {g.title && <div className="nav-sec">{g.title}</div>}
            {g.links.map((l) => (
              <NavLink key={l.to} to={l.to} end={l.end} className={({ isActive }) => `side-link${isActive ? " active" : ""}${planLocked(l) ? " locked" : ""}`}>
                {l.icon}
                {l.label}
                {l.to === "/leads" && newLeads > 0 && <span className="nav-badge">{newLeads}</span>}
                {planLocked(l) && <span className="nav-lock" title="Upgrade">{Icon.lock}</span>}
              </NavLink>
            ))}
          </div>
        ))}
        {hubAdmin && <NavLink to="/hub" className={({ isActive }) => `side-link${isActive ? " active" : ""}`}>{Icon.gear}Hub</NavLink>}
        {store.mode === "demo" && <a className="side-link" href={PUBLIC_SITE_URL}>‹ Back to website</a>}
        <div className="side-foot">
          <div style={{ color: "#fff", fontWeight: 800, fontSize: 14 }}>{me.name}</div>
          <div>{me.role}{me.email ? ` · ${me.email}` : ""}</div>
          <div style={{ marginTop: 2 }}>{business.name}</div>
          {store.mode === "demo" && (
            <select className="select" style={{ marginTop: 8, height: 34, fontSize: 12 }} value={me.id ?? ""} onChange={(e) => viewAs(e.target.value)} aria-label="View as">
              {team.filter((t) => t.active).map((t) => <option key={t.id} value={t.id}>View as: {t.name} ({t.role})</option>)}
            </select>
          )}
          <button className="side-out" onClick={() => void signOut()}>Sign out</button>
        </div>
      </aside>

      <div className="stage">
        <header className="appbar">
          <div className="appbar-brand">
            <img className="logo-mark" src={`${import.meta.env.BASE_URL}logo-mark-v2.png`} alt="" />
            <span>{APP_NAME}</span>
          </div>
          <NotificationBell />
        </header>
        <main className="main">
          {error && <div className="error-banner">{error}</div>}
          <Outlet />
          <Tour />
          <div className="appfoot"><PublicFooter /></div>
        </main>
      </div>

      <nav className="tabbar" aria-label="Main">
        {LINKS.filter(mine).map((l) => (
          <NavLink key={l.to} to={l.to} end={l.end} className={({ isActive }) => `tab${isActive ? " active" : ""}`}>
            {l.icon}
            {l.label}
          </NavLink>
        ))}
        {!locked && (
          <NavLink to="/more" className={({ isActive }) => `tab${isActive ? " active" : ""}`}>
            {Icon.more}
            More
          </NavLink>
        )}
      </nav>
    </div>
  );
}
