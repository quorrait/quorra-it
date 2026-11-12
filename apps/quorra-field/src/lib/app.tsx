import { qboPending } from "./qboSync";
import { claimSession, watchSession } from "./session";
import { disablePush, enablePush } from "./push";
import { errMsg } from "./errors";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Business, Customer, Estimate, Invoice, Job, Lead, Payment, PriceItem, DocTemplate, PurchaseOrder, Role, ServicePlan, Subscription, TeamMember, TimeEntry } from "./types";
import { acceptInvite, pendingInviteCode, rememberInvite } from "./team";
import type { Store } from "./store";
import { canAccess, type Feature, type RoleAccess } from "./access";
import { createDemoStore, resetDemoData } from "./demoStore";
import { createSupabaseStore } from "./supabaseStore";
import { demoMode, hasSupabase, supabase } from "./supabase";
import { demoPlanPreview } from "./demoMode";
import { planAllows, planLabel, resolvePlanId, seatLimit, type GatedFeature, type PlanId } from "./plans";
import { billingPhase, type BillingPhase } from "./billingPhase";
import { PUBLIC_APP_URL } from "./publicUrl";
import { passwordError } from "./safeUrl";

/* ---------------- Auth ---------------- */

interface AuthCtx {
  ready: boolean;
  email: string | null;
  name: string;
  mode: "demo" | "supabase";
  recovery: boolean;
  signIn(email: string, password: string): Promise<void>;
  signUp(email: string, password: string, businessName?: string): Promise<{ needsConfirm: boolean }>;
  resetPassword(email: string): Promise<void>;
  setPassword(password: string): Promise<void>;
  signOut(): Promise<void>;
}

const AuthContext = createContext<AuthCtx | null>(null);
const DEMO_SESSION = "quorra-field-demo-session";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [authName, setAuthName] = useState("");
  const [recovery, setRecovery] = useState(false);

  useEffect(() => {
    if (!supabase) {
      let saved: string | null = null;
      try { saved = localStorage.getItem(DEMO_SESSION); } catch { /* ignore */ }
      // ?demo=1 should open the sample company immediately, not the sign-in form.
      if (demoMode) {
        const who = saved || "demo@quorrait.com";
        try { localStorage.setItem(DEMO_SESSION, who); } catch { /* ignore */ }
        setEmail(who);
      } else {
        setEmail(saved);
      }
      setReady(true);
      return;
    }
    supabase.auth.getSession().then(async ({ data }) => {
      // "Remember me" off: the sign-in only lasts until the browser is closed.
      try {
        if (data.session && localStorage.getItem("qd_no_remember") && !sessionStorage.getItem("qd_alive")) {
          await supabase!.auth.signOut({ scope: "local" });
          localStorage.removeItem("qd_no_remember");
          setEmail(null); setReady(true); return;
        }
      } catch { /* storage blocked */ }
      setEmail(data.session?.user.email ?? null);
      setAuthName(String(data.session?.user.user_metadata?.name ?? ""));
      setReady(true);
    }).catch(() => { setEmail(null); setReady(true); });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      setEmail(session?.user.email ?? null);
      setAuthName(String(session?.user.user_metadata?.name ?? ""));
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
    });
    // Native only: register this phone once a session exists. The browser build never reaches enablePush.
    const stop = watchSession(() => { void supabase!.auth.signOut({ scope: "local" }); });
    return () => { sub.subscription.unsubscribe(); stop(); };
  }, []);

  useEffect(() => {
    if (email && !recovery) void enablePush().catch((e) => console.error("push", e));
  }, [email, recovery]);

  const value = useMemo<AuthCtx>(
    () => ({
      ready,
      email,
      name: authName,
      recovery,
      mode: hasSupabase ? "supabase" : "demo",
      async signIn(e, p) {
        if (!supabase) {
          try {
            localStorage.setItem(DEMO_SESSION, e || "demo@example.com");
          } catch {
            /* ignore */
          }
          setEmail(e || "demo@example.com");
          return;
        }
        const { data, error } = await supabase.functions.invoke("login", { body: { email: e, password: p } });
        if (error) throw await functionError(error, "Could not sign in.");
        const session = data as { access_token?: string; refresh_token?: string } | null;
        if (!session?.access_token || !session.refresh_token) throw new Error("Could not sign in.");
        const { error: setErr } = await supabase.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token });
        if (setErr) throw setErr;
        await claimSession().catch(() => undefined);
      },
      async resetPassword(address) {
        if (!supabase) throw new Error("Password reset is not available in the demo.");
        const { error } = await supabase.auth.resetPasswordForEmail(address.trim(), { redirectTo: PUBLIC_APP_URL });
        if (error) throw error;
      },
      async setPassword(password) {
        if (!supabase) throw new Error("Password reset is not available in the demo.");
        const pw = passwordError(password);
        if (pw) throw new Error(pw);
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        const { error: clearError } = await supabase.functions.invoke("login", { body: { action: "clear" } });
        if (clearError) throw await functionError(clearError, "Your password was changed, but sign-in could not be unlocked. Sign in with the new password.");
        setRecovery(false);
        await claimSession().catch(() => undefined);
      },
      async signUp(e, p, businessName) {
        if (!supabase) {
          await this.signIn(e, p);
          return { needsConfirm: false };
        }
        const { data, error } = await supabase.auth.signUp({ email: e, password: p, options: { data: { business_name: businessName ?? "" } } });
        if (error) throw /already registered/i.test(error.message) ? new Error("That email already has a login. Sign in instead, or use a different email.") : error;
        if (data.user && data.user.identities && data.user.identities.length === 0) throw new Error("That email already has a login. Sign in instead, or use a different email.");
        return { needsConfirm: !data.session };
      },
      async signOut() {
        if (!supabase) {
          try {
            localStorage.removeItem(DEMO_SESSION);
          } catch {
            /* ignore */
          }
          setEmail(null);
          return;
        }
        await disablePush().catch(() => undefined);
        await supabase.auth.signOut();
      },
    }),
    [ready, email, authName, recovery],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

async function functionError(error: unknown, fallback: string): Promise<Error> {
  const ctx = (error as { context?: Response }).context;
  try {
    const body = await ctx?.json();
    if (body && typeof body === "object" && "error" in body && body.error) return new Error(String(body.error));
  } catch { /* keep the fallback */ }
  return new Error(fallback);
}

export const useAuth = () => {
  const v = useContext(AuthContext);
  if (!v) throw new Error("AuthProvider missing");
  return v;
};

/* ---------------- Data ---------------- */

interface DataCtx {
  me: { id: string | null; name: string; email: string; role: Role; isOwner: boolean };
  subscription: Subscription | null;
  phase: BillingPhase;
  locked: boolean;
  planId: PlanId;
  allows(f: GatedFeature): boolean;
  activeLogins: number;
  loginDisabled(teamMemberId: string): boolean;
  setLoginActive(teamMemberId: string, active: boolean): Promise<string | null>;
  can(f: Feature): boolean;
  viewAs(memberId: string): void;
  store: Store;
  loading: boolean;
  error: string | null;
  business: Business;
  customers: Customer[];
  jobs: Job[];
  invoices: Invoice[];
  payments: Payment[];
  priceItems: PriceItem[];
  estimates: Estimate[];
  leads: Lead[];
  plans: ServicePlan[];
  team: TeamMember[];
  timeEntries: TimeEntry[];
  purchaseOrders: PurchaseOrder[];
  docTemplates: DocTemplate[];
  refresh(): Promise<void>;
  resetDemo(): void;
  customerById(id: string): Customer | undefined;
}

const DataContext = createContext<DataCtx | null>(null);

const EMPTY_BUSINESS: Business = {
  name: "",
  phone: "",
  email: "",
  tax_rate: 0,
  qbo_connected: false,
  qbo_company: null,
  stripe_connected: false,
  logo: null,
};

export function DataProvider({ children }: { children: ReactNode }) {
  const { email, name: authName, signOut } = useAuth();
  const [asId, setAsId] = useState<string | null>(() => { try { return localStorage.getItem("qf-view-as"); } catch { return null; } });
  const store = useMemo<Store>(() => (hasSupabase ? createSupabaseStore() : createDemoStore()), []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [business, setBusiness] = useState<Business>(EMPTY_BUSINESS);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [priceItems, setPriceItems] = useState<PriceItem[]>([]);
  const [estimates, setEstimates] = useState<Estimate[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [plans, setPlans] = useState<ServicePlan[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [docTemplates, setDocTemplates] = useState<DocTemplate[]>([]);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [requireSub, setRequireSub] = useState(false);
  const [myMemberId, setMyMemberId] = useState<string | null>(null);
  const [myRole, setMyRole] = useState<string | null>(null);
  const [isStaff, setIsStaff] = useState(false);
  const [serverPlan, setServerPlan] = useState<PlanId | null>(null);
  const [platformStaff, setPlatformStaff] = useState(false);
  const [loginOff, setLoginOff] = useState(false);
  const [activeLogins, setActiveLogins] = useState(1);
  const [loginFlags, setLoginFlags] = useState<Record<string, boolean>>({});
  const [demoOff, setDemoOff] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem("qd-demo-login-off") || "[]"); } catch { return []; } });

  const refresh = useCallback(async () => {
    try {
      // Someone who opened an invite link joins that business before anything loads.
      if (hasSupabase && supabase) {
        const code = pendingInviteCode();
        if (code) {
          const err = await acceptInvite(code);
          rememberInvite(null);
          if (err) setError(err);
        }
        const uid = (await supabase.auth.getUser()).data.user?.id ?? "";
        let mem = await supabase.from("account_members").select("team_member_id, active").eq("user_id", uid).maybeSingle();
        if (mem.error) mem = await supabase.from("account_members").select("team_member_id").eq("user_id", uid).maybeSingle();
        if (mem.data && "active" in mem.data && mem.data.active === false) {
          setLoginOff(true);
          setLoading(false);
          return;
        }
        setLoginOff(false);
        const [sub, set, rol, planRes, staffRes, members] = await Promise.all([
          supabase.from("subscriptions").select("*").maybeSingle(),
          supabase.from("platform_settings").select("require_subscription").maybeSingle(),
          supabase.rpc("my_role"),
          supabase.rpc("plan_id"),
          supabase.rpc("is_platform_admin"),
          supabase.from("account_members").select("team_member_id, active"),
        ]);
        setMyRole(typeof rol.data === "string" ? rol.data : null);
        setIsStaff(Boolean(mem.data));
        setMyMemberId((mem.data?.team_member_id as string | null | undefined) ?? null);
        setSubscription((sub.data as Subscription | null) ?? null);
        setRequireSub(Boolean(set.data?.require_subscription));
        setPlatformStaff(staffRes.data === true);
        if (typeof planRes.data === "string" && (planRes.data === "basic" || planRes.data === "essentials" || planRes.data === "enterprise")) setServerPlan(planRes.data);
        if (!members.error && members.data) {
          const flags: Record<string, boolean> = {};
          let on = 0;
          for (const row of members.data as { team_member_id: string | null; active?: boolean }[]) {
            const live = row.active !== false;
            if (row.team_member_id) flags[row.team_member_id] = live;
            if (live) on++;
          }
          setLoginFlags(flags);
          setActiveLogins(1 + on);
        } else {
          const fallback = await supabase.from("account_members").select("team_member_id");
          setActiveLogins(1 + (fallback.data?.length ?? 0));
        }
      } else {
        setSubscription({ status: "active", plan: "Quorra Dispatch", amount_cents: 19000, billing_interval: "month", current_period_end: new Date(Date.now() + 19 * 86400_000).toISOString(), cancel_at_period_end: false, comped: false });
      }
      // Load every list on its own so one missing table or column cannot blank the whole app,
      // and say exactly which one failed.
      const failed: string[] = [];
      const part = <T,>(label: string, p: Promise<T>, fallback: T): Promise<T> =>
        p.catch((e) => { failed.push(`${label}: ${errMsg(e, "failed")}`); return fallback; });
      const [b, c, j, i, p, pi, es, ld, sp, tm, te, po, dt] = await Promise.all([
        store.getBusiness(),
        part("customers", store.listCustomers(), [] as Customer[]),
        part("jobs", store.listJobs(), [] as Job[]),
        part("invoices", store.listInvoices(), [] as Invoice[]),
        part("payments", store.listPayments(), [] as Payment[]),
        part("price book", store.listRows("price_items"), [] as PriceItem[]),
        part("estimates", store.listRows("estimates"), [] as Estimate[]),
        part("leads", store.listRows("leads"), [] as Lead[]),
        part("service plans", store.listRows("service_plans"), [] as ServicePlan[]),
        part("team", store.listRows("team_members"), [] as TeamMember[]),
        part("time entries", store.listRows("time_entries"), [] as TimeEntry[]),
        part("purchase orders", store.listRows("purchase_orders"), [] as PurchaseOrder[]),
        store.listRows("doc_templates").catch(() => [] as DocTemplate[]), // table may not exist until migration 0004 is run
      ]);
      setBusiness(b);
      setCustomers(c);
      setJobs(j);
      setInvoices(i);
      setPayments(p);
      setPriceItems(pi);
      setEstimates(es);
      setLeads(ld);
      setPlans(sp);
      setTeam(tm);
      if (!hasSupabase) setActiveLogins(1 + tm.filter((t) => t.role !== "Owner" && t.active !== false && !demoOff.includes(t.id)).length);
      setTimeEntries(te);
      setPurchaseOrders(po);
      setDocTemplates(dt);
      setError(failed.length ? `Could not load some data. ${failed.join("; ")}` : null);
    } catch (e) {
      setError(errMsg(e, "Could not load data"));
    } finally {
      setLoading(false);
    }
  }, [store, demoOff]);

  useEffect(() => {
    void refresh();
    // Live accounts receive website leads and quote answers while the app is open.
    if (!hasSupabase) return;
    const t = setInterval(() => void refresh(), 20_000);
    const back = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", back);
    window.addEventListener("focus", back);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", back); window.removeEventListener("focus", back); };
  }, [refresh]);

  // Who is using the app. Real accounts: match the login email to a team member (no match = the account owner).
  // Demo: the "View as" switcher picks any team member so you can see each role's screens.
  const meMember = hasSupabase
    ? team.find((t) => t.id === myMemberId) ?? (isStaff ? team.find((t) => t.active && t.email.toLowerCase() === (email ?? "").toLowerCase()) : team.find((t) => t.role === "Owner"))
    : team.find((t) => t.id === asId) ?? team.find((t) => t.role === "Owner");
  const fromEmail = (email ?? "").split("@")[0].replace(/[._-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) || "You";
  const role = (meMember?.role ?? (isStaff ? myRole ?? "Technician" : "Owner")) as Role;
  const me = { id: meMember?.id ?? null, name: meMember?.name ?? (authName || fromEmail), email: email ?? "", role, isOwner: role === "Owner" || (!isStaff && hasSupabase) };
  const phase: BillingPhase = !hasSupabase ? "ok" : billingPhase(subscription);
  const locked = phase === "lapsed" || phase === "closed";
  const preview = demoMode ? demoPlanPreview() : null;
  const planId: PlanId = preview ?? serverPlan ?? resolvePlanId(subscription?.plan, { demo: demoMode, comped: Boolean(subscription?.comped), staff: platformStaff });
  const allows = (f: GatedFeature) => planAllows(planId, f);
  const visibleJobs = me.role === "Technician" ? jobs.filter((j) => j.assigned_to === me.name) : jobs;

  // First time QuickBooks is linked: bring their existing customers, invoices and payments in, so the earnings numbers are right.
  const qboImporting = useRef(false);
  useEffect(() => {
    if (!hasSupabase || !allows("qbo") || !me.isOwner || !business.qbo_connected || business.qbo_imported_at || loading || qboImporting.current) return;
    qboImporting.current = true;
    void store.qboImport().then(() => refresh()).catch(() => undefined);
  }, [business.qbo_connected, business.qbo_imported_at, loading, me.isOwner, store, refresh, planId]);

  // QuickBooks connected: send sent and paid invoices (and their payments) over automatically, once per change.
  const qboTried = useRef(new Set<string>());
  useEffect(() => {
    if (!hasSupabase || !allows("qbo") || !me.isOwner || !business.qbo_connected || loading) return;
    const todo = qboPending(invoices, payments).filter((x) => !qboTried.current.has(x.key));
    if (!todo.length) return;
    todo.forEach((x) => qboTried.current.add(x.key));
    void (async () => {
      let did = false;
      for (const x of todo.slice(0, 10)) { try { await store.qboSyncInvoice(x.id, { action: x.action, hash: x.hash }); did = true; } catch { /* Integrations has a Sync everything backup */ } }
      if (did) void refresh();
    })();
  }, [invoices, payments, business.qbo_connected, loading, me.isOwner, store, refresh, planId]);

  const setLoginActive = useCallback(async (teamMemberId: string, active: boolean) => {
    if (!hasSupabase || !supabase) {
      const off = new Set(demoOff);
      if (active) off.delete(teamMemberId);
      else off.add(teamMemberId);
      const next = 1 + team.filter((t) => t.role !== "Owner" && t.active !== false && !off.has(t.id)).length;
      if (active && next > seatLimit(planId)) return `Your ${planLabel(planId)} plan allows ${seatLimit(planId)} logins. Deactivate another login first.`;
      const list = [...off];
      try { localStorage.setItem("qd-demo-login-off", JSON.stringify(list)); } catch { /* ignore */ }
      setDemoOff(list);
      return null;
    }
    const { error } = await supabase.rpc("set_login_active", { p_member: teamMemberId, p_active: active });
    if (error) return error.message;
    await refresh();
    return null;
  }, [demoOff, team, planId, refresh]);

  const value = useMemo<DataCtx>(
    () => ({
      me,
      subscription,
      phase,
      locked,
      planId,
      allows,
      activeLogins,
      loginDisabled: (id) => (hasSupabase ? loginFlags[id] === false : demoOff.includes(id)),
      setLoginActive,
      can: (f) => canAccess(me.role, f, business.role_access as RoleAccess | null | undefined, meMember?.access as Feature[] | null | undefined),
      viewAs(id) { try { localStorage.setItem("qf-view-as", id); } catch { /* ignore */ } setAsId(id); },
      store,
      loading,
      error,
      business,
      customers,
      jobs: visibleJobs,
      invoices,
      payments,
      priceItems,
      estimates,
      leads,
      plans,
      team,
      timeEntries,
      purchaseOrders,
      docTemplates,
      refresh,
      resetDemo() {
        resetDemoData();
        location.reload();
      },
      customerById: (id) => customers.find((c) => c.id === id),
    }),
    [store, subscription, phase, locked, planId, activeLogins, loginFlags, demoOff, setLoginActive, loading, error, business, customers, jobs, invoices, payments, priceItems, estimates, leads, plans, team, timeEntries, purchaseOrders, docTemplates, refresh, me.id, me.role, me.name, visibleJobs],
  );

  if (loginOff) {
    return (
      <div className="auth"><div className="auth-card stack">
        <h1>Login deactivated</h1>
        <p className="muted" style={{ margin: 0 }}>The account owner turned this login off. Your jobs and history are still there. You cannot sign in until they turn it back on.</p>
        <button className="btn block" onClick={() => void signOut()}>Sign out</button>
      </div></div>
    );
  }

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export const useData = () => {
  const v = useContext(DataContext);
  if (!v) throw new Error("DataProvider missing");
  return v;
};
