import { useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { applyStatusBar } from "./lib/native";
import { AuthProvider, DataProvider, useAuth } from "./lib/app";
import { exitDemo, leaveDemoForTrial } from "./lib/demoMode";
import { demoMode } from "./lib/supabase";
import { ConfirmProvider, Spinner, ToastProvider } from "./components/ui";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Contact from "./pages/Contact";
import PublicFooter from "./components/PublicFooter";
import Dashboard from "./pages/Dashboard";
import Calendar from "./pages/Calendar";
import Jobs from "./pages/Jobs";
import JobDetail from "./pages/JobDetail";
import Invoices from "./pages/Invoices";
import InvoiceDetail from "./pages/InvoiceDetail";
import Customers from "./pages/Customers";
import Leads from "./pages/Leads";
import Estimates from "./pages/Estimates";
import EstimateDetail from "./pages/EstimateDetail";
import PriceBook from "./pages/PriceBook";
import ServicePlans from "./pages/ServicePlans";
import PurchaseOrders from "./pages/PurchaseOrders";
import Team from "./pages/Team";
import Timesheets from "./pages/Timesheets";
import Reports from "./pages/Reports";
import { useData } from "./lib/app";
import { ROUTE_FEATURE } from "./lib/access";
import Templates from "./pages/Templates";
import Import from "./pages/Import";
import Plans from "./pages/Plans";
import Start from "./pages/Start";
import Billing from "./pages/Billing";
import Join from "./pages/Join";
import Settings, { More } from "./pages/Settings";
import Integrations from "./pages/Integrations";
import Support from "./pages/Support";
import Hub from "./pages/Hub";

function Guard({ path, children }: { path: string; children: JSX.Element }) {
  const { can, loading } = useData();
  const f = ROUTE_FEATURE[path];
  if (loading || !f || can(f)) return children;
  return <Navigate to="/" replace />;
}

function Locked({ children }: { children: JSX.Element }) {
  const { locked, me, loading } = useData();
  if (loading || !locked) return children;
  if (!me.isOwner) return <div className="auth"><div className="auth-card stack"><h1>Plan not active</h1><p className="muted">Your company's Quorra Dispatch plan is not active. Ask the account owner to restart it under Billing.</p></div></div>;
  return <LockedOwner>{children}</LockedOwner>;
}

/** Owner of a business with no active plan: every screen except Billing sends them to Billing to start the trial. */
function LockedOwner({ children }: { children: JSX.Element }) {
  const { pathname } = useLocation();
  if (pathname !== "/billing") return <Navigate to="/billing" replace />;
  return children;
}

/** Someone already signed in opens the "Start free trial" link: say so, and let them sign out to start a new account. */
function AlreadySignedIn() {
  const { email, signOut } = useAuth();
  useEffect(() => { void applyStatusBar("login"); }, []);
  return (
    <div className="auth"><div className="auth-card stack">
      <h1>You are already signed in</h1>
      <p className="muted" style={{ margin: 0 }}>You are signed in as {email}. To start a new free trial with a different account, sign out first.</p>
      <a className="btn primary block" href="#/">Go to my dashboard</a>
      <button className="btn block" onClick={() => void signOut().then(() => { location.hash = "#/start"; })}>Sign out and start a new trial</button>
    </div></div>
  );
}

function DemoBanner() {
  return (
    <div className="demo-banner" role="status">
      <button type="button" onClick={leaveDemoForTrial}>Demo — start free trial</button>
      <button type="button" className="demo-exit" onClick={exitDemo}>Exit</button>
    </div>
  );
}

function Gate() {
  const { ready, email } = useAuth();
  useEffect(() => { if (!email) void applyStatusBar("login"); }, [email]);
  let body: JSX.Element;
  if (!ready) body = <div className="auth"><Spinner /></div>;
  else if (!email) body = (
    <div className="pub">
    <Routes>
      <Route path="plans" element={<Plans />} />
      <Route path="contact" element={<Contact />} />
      <Route path="start" element={<Start />} />
      <Route path="join" element={<Login />} />
      <Route path="*" element={<Login />} />
    </Routes>
    <PublicFooter />
    </div>
  );
  else body = (
    <DataProvider>
      <Locked>
      <Routes>
        <Route path="contact" element={<Contact />} />
        <Route path="start" element={<AlreadySignedIn />} />
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="calendar" element={<Calendar />} />
          <Route path="jobs" element={<Jobs />} />
          <Route path="jobs/:id" element={<JobDetail />} />
          <Route path="invoices" element={<Guard path="/invoices"><Invoices /></Guard>} />
          <Route path="invoices/:id" element={<Guard path="/invoices"><InvoiceDetail /></Guard>} />
          <Route path="customers" element={<Guard path="/customers"><Customers /></Guard>} />
          <Route path="leads" element={<Guard path="/leads"><Leads /></Guard>} />
          <Route path="estimates" element={<Guard path="/estimates"><Estimates /></Guard>} />
          <Route path="estimates/:id" element={<Guard path="/estimates"><EstimateDetail /></Guard>} />
          <Route path="pricebook" element={<Guard path="/pricebook"><PriceBook /></Guard>} />
          <Route path="templates" element={<Guard path="/templates"><Templates /></Guard>} />
          <Route path="import" element={<Guard path="/import"><Import /></Guard>} />
          <Route path="plans" element={<Guard path="/plans"><ServicePlans /></Guard>} />
          <Route path="purchase-orders" element={<Guard path="/purchase-orders"><PurchaseOrders /></Guard>} />
          <Route path="team" element={<Guard path="/team"><Team /></Guard>} />
          <Route path="timesheets" element={<Guard path="/timesheets"><Timesheets /></Guard>} />
          <Route path="reports" element={<Guard path="/reports"><Reports /></Guard>} />
          <Route path="settings" element={<Guard path="/settings"><Settings /></Guard>} />
          <Route path="hub" element={<Hub />} />
          <Route path="support" element={<Support />} />
          <Route path="integrations" element={<Guard path="/integrations"><Integrations /></Guard>} />
          <Route path="billing" element={<Guard path="/billing"><Billing /></Guard>} />
          <Route path="join" element={<Join />} />
          <Route path="more" element={<More />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
      </Locked>
    </DataProvider>
  );
  return (
    <div className="app-root">
      {demoMode && <DemoBanner />}
      <div className="app-fill">{body}</div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <ConfirmProvider>
          <Gate />
        </ConfirmProvider>
      </ToastProvider>
    </AuthProvider>
  );
}
