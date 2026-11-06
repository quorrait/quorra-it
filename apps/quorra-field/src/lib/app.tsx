import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Business, Customer, Estimate, Invoice, Job, Lead, Payment, PriceItem, DocTemplate, PurchaseOrder, Role, ServicePlan, TeamMember, TimeEntry } from "./types";
import type { Store } from "./store";
import { canAccess, type Feature } from "./access";
import { createDemoStore, resetDemoData } from "./demoStore";
import { createSupabaseStore } from "./supabaseStore";
import { hasSupabase, supabase } from "./supabase";

/* ---------------- Auth ---------------- */

interface AuthCtx {
  ready: boolean;
  email: string | null;
  mode: "demo" | "supabase";
  signIn(email: string, password: string): Promise<void>;
  signUp(email: string, password: string): Promise<{ needsConfirm: boolean }>;
  signOut(): Promise<void>;
}

const AuthContext = createContext<AuthCtx | null>(null);
const DEMO_SESSION = "quorra-field-demo-session";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) {
      try {
        setEmail(localStorage.getItem(DEMO_SESSION));
      } catch {
        /* ignore */
      }
      setReady(true);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setEmail(data.session?.user.email ?? null);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => setEmail(session?.user.email ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  const value = useMemo<AuthCtx>(
    () => ({
      ready,
      email,
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
        const { error } = await supabase.auth.signInWithPassword({ email: e, password: p });
        if (error) throw error;
      },
      async signUp(e, p) {
        if (!supabase) {
          await this.signIn(e, p);
          return { needsConfirm: false };
        }
        const { data, error } = await supabase.auth.signUp({ email: e, password: p });
        if (error) throw error;
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
        await supabase.auth.signOut();
      },
    }),
    [ready, email],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const v = useContext(AuthContext);
  if (!v) throw new Error("AuthProvider missing");
  return v;
};

/* ---------------- Data ---------------- */

interface DataCtx {
  me: { id: string | null; name: string; role: Role };
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
  const { email } = useAuth();
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

  const refresh = useCallback(async () => {
    try {
      const [b, c, j, i, p, pi, es, ld, sp, tm, te, po, dt] = await Promise.all([
        store.getBusiness(),
        store.listCustomers(),
        store.listJobs(),
        store.listInvoices(),
        store.listPayments(),
        store.listRows("price_items"),
        store.listRows("estimates"),
        store.listRows("leads"),
        store.listRows("service_plans"),
        store.listRows("team_members"),
        store.listRows("time_entries"),
        store.listRows("purchase_orders"),
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
      setTimeEntries(te);
      setPurchaseOrders(po);
      setDocTemplates(dt);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load data");
    } finally {
      setLoading(false);
    }
  }, [store]);

  useEffect(() => {
    void refresh();
    // Live accounts receive website leads and quote answers while the app is open.
    if (!hasSupabase) return;
    const t = setInterval(() => void refresh(), 60_000);
    return () => clearInterval(t);
  }, [refresh]);

  // Who is using the app. Real accounts: match the login email to a team member (no match = the account owner).
  // Demo: the "View as" switcher picks any team member so you can see each role's screens.
  const meMember = hasSupabase
    ? team.find((t) => t.active && t.email.toLowerCase() === (email ?? "").toLowerCase())
    : team.find((t) => t.id === asId) ?? team.find((t) => t.role === "Owner");
  const me = { id: meMember?.id ?? null, name: meMember?.name ?? "Owner", role: (meMember?.role ?? "Owner") as Role };
  const visibleJobs = me.role === "Technician" ? jobs.filter((j) => j.assigned_to === me.name) : jobs;

  const value = useMemo<DataCtx>(
    () => ({
      me,
      can: (f) => canAccess(me.role, f),
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
    [store, loading, error, business, customers, jobs, invoices, payments, priceItems, estimates, leads, plans, team, timeEntries, purchaseOrders, docTemplates, refresh, me.id, me.role, me.name, visibleJobs],
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export const useData = () => {
  const v = useContext(DataContext);
  if (!v) throw new Error("DataProvider missing");
  return v;
};
