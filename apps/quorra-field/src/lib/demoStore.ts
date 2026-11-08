import type {
  Business, CollectionName, Collections, Customer, Estimate, EstimateStatus, Invoice, Job, Lead, LeadStage, LineItem, New,
  Payment, PayMethod, PriceCategory, PriceItem, PurchaseOrder, ServicePlan, TeamMember, TimeEntry,
} from "./types";
import { type Store, uid } from "./store";
import { addDays, startOfDay } from "./dates";
import { invoiceTotals, amountPaid } from "./money";

const KEY = "quorra-field-demo-v5";

interface DB {
  business: Business;
  customers: Customer[];
  jobs: Job[];
  invoices: Invoice[];
  payments: Payment[];
  rows: { [K in CollectionName]?: Collections[K][] };
}

// Small deterministic RNG so the demo data looks the same each time it's created.
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function at(day: Date, hour: number, min = 0) {
  const d = new Date(day);
  d.setHours(hour, min, 0, 0);
  return d;
}

function seed(): DB {
  const r = rng(42);
  const today = startOfDay(new Date());

  const customers: Customer[] = [
    ["Maria Delgado", "(916) 555-0142", "maria.delgado@example.com", "418 Oakmont Dr, Rocklin, CA"],
    ["Tom & Linda Hargrove", "(916) 555-0177", "hargrove.home@example.com", "92 Sierra View Ct, Lincoln, CA"],
    ["Sunrise Dental Group", "(916) 555-0120", "office@sunrisedental.example.com", "2210 Sunset Blvd, Rocklin, CA"],
    ["Greg Whitaker", "(916) 555-0166", "greg.w@example.com", "7 Quarry Ridge Ln, Loomis, CA"],
    ["Priya Nair", "(916) 555-0109", "priya.nair@example.com", "1550 Pleasant Grove Blvd, Roseville, CA"],
    ["Blue Door Bakery", "(916) 555-0133", "hello@bluedoorbakery.example.com", "310 Lincoln Way, Auburn, CA"],
    ["Dave Okafor", "(916) 555-0188", "dave.okafor@example.com", "63 Twelve Bridges Dr, Lincoln, CA"],
    ["Carol Jennings", "(916) 555-0151", "carol.j@example.com", "804 Granite Dr, Granite Bay, CA"],
  ].map(([name, phone, email, address]) => ({ id: uid(), name, phone, email, address, notes: "" }));

  const catalog: { title: string; items: LineItem[]; hrs: number }[] = [
    { title: "AC not cooling - diagnostic + repair", hrs: 2, items: [{ description: "Diagnostic visit", qty: 1, unit_cents: 12900 }, { description: "Capacitor replacement", qty: 1, unit_cents: 18500 }, { description: "Labor (hrs)", qty: 1.5, unit_cents: 12500 }] },
    { title: "Water heater replacement (40 gal)", hrs: 4, items: [{ description: "40 gal gas water heater", qty: 1, unit_cents: 89900 }, { description: "Install kit + venting", qty: 1, unit_cents: 14500 }, { description: "Labor (hrs)", qty: 3, unit_cents: 12500 }] },
    { title: "Kitchen drain clog", hrs: 1, items: [{ description: "Drain clearing", qty: 1, unit_cents: 17500 }] },
    { title: "Panel upgrade 100A to 200A", hrs: 6, items: [{ description: "200A panel + breakers", qty: 1, unit_cents: 128000 }, { description: "Permit + inspection", qty: 1, unit_cents: 22500 }, { description: "Labor (hrs)", qty: 6, unit_cents: 14500 }] },
    { title: "Furnace tune-up", hrs: 1, items: [{ description: "Seasonal tune-up", qty: 1, unit_cents: 14900 }, { description: "Filter", qty: 1, unit_cents: 2400 }] },
    { title: "Install 6 recessed lights", hrs: 3, items: [{ description: "LED recessed fixtures", qty: 6, unit_cents: 4500 }, { description: "Labor (hrs)", qty: 3, unit_cents: 13500 }] },
    { title: "Bathroom faucet + toilet install", hrs: 2, items: [{ description: "Faucet install", qty: 1, unit_cents: 21000 }, { description: "Toilet install", qty: 1, unit_cents: 26500 }] },
    { title: "Mini-split install (2-ton)", hrs: 7, items: [{ description: "2-ton mini-split system", qty: 1, unit_cents: 218000 }, { description: "Line set + electrical", qty: 1, unit_cents: 42000 }, { description: "Labor (hrs)", qty: 7, unit_cents: 12500 }] },
  ];
  const team: TeamMember[] = [
    ["Alex Summit", "Owner", 5500, 0, "#0f1720"],
    ["Jake Ramirez", "Technician", 3200, 8, "#e8590c"],
    ["Marcus Cole", "Technician", 3600, 10, "#1b64d1"],
    ["Dana Whitfield", "Technician", 3400, 8, "#137a3c"],
    ["Jenny Park", "Office", 2400, 0, "#8b5cf6"],
    ["Sam Rivera", "Manager", 4500, 0, "#0891b2"],
  ].map(([name, role, hourly_cents, commission_pct, color]) => ({
    id: uid(), name: name as string, role: role as TeamMember["role"], phone: "(916) 555-01" + String(10 + Math.floor(r() * 80)),
    email: (name as string).split(" ")[0].toLowerCase() + "@summithome.example.com", hourly_cents: hourly_cents as number,
    commission_pct: commission_pct as number, color: color as string, active: true,
  }));
  const crew = team.filter((t) => t.role === "Technician").map((t) => t.name);
  const taxRate = 7.25;

  const jobs: Job[] = [];
  const invoices: Invoice[] = [];
  const payments: Payment[] = [];
  let number = 1000;

  // Past ~11 weeks through next 10 days, 1-3 jobs per weekday.
  for (let offset = -75; offset <= 10; offset++) {
    const day = addDays(today, offset);
    if (day.getDay() === 0 || (day.getDay() === 6 && r() > 0.3)) continue;
    const n = offset === 0 ? 3 : 1 + Math.floor(r() * 3);
    let hour = 8;
    for (let k = 0; k < n; k++) {
      const c = customers[Math.floor(r() * customers.length)];
      const t = catalog[Math.floor(r() * catalog.length)];
      const start = at(day, hour, r() > 0.5 ? 0 : 30);
      const end = new Date(start.getTime() + t.hrs * 3600_000);
      hour = Math.min(15, hour + Math.max(2, Math.ceil(t.hrs)));
      const past = end.getTime() < Date.now();
      const status: Job["status"] = past ? (r() > 0.04 ? "completed" : "canceled") : offset === 0 && start.getTime() < Date.now() ? "in_progress" : "scheduled";
      const job: Job = {
        id: uid(),
        customer_id: c.id,
        title: t.title,
        description: "",
        address: c.address,
        status,
        start_at: start.toISOString(),
        end_at: end.toISOString(),
        assigned_to: crew[Math.floor(r() * crew.length)],
      };
      if (status === "completed") {
        const q = Math.round((end.getTime() - start.getTime()) / 60000);
        job.actual_minutes = Math.max(30, Math.round((q + (Math.floor(r() * 5) - 1) * 15) / 15) * 15);
      }
      jobs.push(job);

      if (status === "completed") {
        const inv: Invoice = {
          id: uid(),
          number: ++number,
          customer_id: c.id,
          job_id: job.id,
          status: "sent",
          items: t.items,
          tax_rate: taxRate,
          issued_at: end.toISOString(),
          due_at: addDays(end, 14).toISOString(),
          qbo_id: null,
        };
        const total = invoiceTotals(inv).total;
        const ageDays = (Date.now() - end.getTime()) / 86400_000;
        // Older invoices are almost always settled; only recent ones stay open.
        const unpaidChance = ageDays < 10 ? 0.2 : 0.04;
        const roll = r();
        // Most get paid within 0-4 days; a few stay unpaid so Outstanding has something in it.
        const delayed = end.getTime() + Math.floor(r() * 4) * 86400_000 + 3600_000;
        // Recent jobs that would "pay in the future" mostly stay unpaid instead of piling up on today.
        const paidMs = delayed <= Date.now() ? delayed : r() < 0.35 ? end.getTime() + 3600_000 : null;
        if (roll < 1 - unpaidChance && paidMs !== null && paidMs <= Date.now()) {
          inv.status = "paid";
          const method: PayMethod = r() < 0.6 ? "card" : r() < 0.6 ? "check" : "cash";
          payments.push({ id: uid(), invoice_id: inv.id, amount_cents: total, method, paid_at: new Date(paidMs).toISOString() });
        } else if (roll >= 1 - unpaidChance && roll < 1 - unpaidChance / 2) {
          const part = Math.round(total * 0.5);
          payments.push({ id: uid(), invoice_id: inv.id, amount_cents: part, method: "card", paid_at: addDays(end, 1).toISOString() });
        }
        invoices.push(inv);
      }
    }
  }

  // Make sure the demo always shows some money coming in today, whatever time it is opened.
  const unpaid = invoices
    .filter((i) => i.status === "sent" && !payments.some((p) => p.invoice_id === i.id))
    .sort((a, b) => b.number - a.number)
    .slice(0, 2);
  unpaid.forEach((inv, n) => {
    const t = Math.max(today.getTime() + 60_000, Date.now() - (n + 1) * 25 * 60_000);
    inv.status = "paid";
    payments.push({ id: uid(), invoice_id: inv.id, amount_cents: invoiceTotals(inv).total, method: n === 0 ? "card" : "check", paid_at: new Date(Math.min(t, Date.now() - 1000)).toISOString() });
  });

  /* ---------- Price book, estimates, leads, plans, time, POs ---------- */
  const rel = (n: number, h = 10) => at(addDays(today, n), h).toISOString();
  const cust = (i: number) => customers[i % customers.length];

  const price_items: PriceItem[] = (
    [
      ["Diagnostic / service call", "Trip charge and troubleshooting", "Service", 12900, 0],
      ["Labor - technician (hr)", "Standard hourly rate", "Labor", 12500, 3200],
      ["Labor - emergency (hr)", "After hours and weekends", "Labor", 18500, 3200],
      ["40 gal gas water heater", "", "Material", 89900, 52000],
      ["50 gal electric water heater", "", "Material", 94900, 58000],
      ["Water heater install kit + venting", "", "Material", 14500, 6500],
      ["Capacitor (dual run)", "", "Material", 18500, 2200],
      ["Furnace / AC tune-up", "Seasonal maintenance visit", "Service", 14900, 2500],
      ["Drain clearing (kitchen / bath)", "", "Service", 17500, 1500],
      ["Toilet install", "", "Service", 26500, 0],
      ["Faucet install", "", "Service", 21000, 0],
      ["200A panel + breakers", "", "Material", 128000, 71000],
      ["Permit + inspection", "Passed through at cost", "Service", 22500, 22500],
      ["LED recessed light", "", "Material", 4500, 1400],
      ["2-ton mini-split system", "", "Equipment", 218000, 141000],
      ["Line set + electrical (mini-split)", "", "Material", 42000, 17000],
      ["EV charger install (240V)", "Circuit, outlet and labor", "Service", 79500, 21000],
      ["Refrigerant R-410A (lb)", "", "Material", 9500, 3800],
    ] as [string, string, PriceCategory, number, number][]
  ).map(([name, description, category, unit_cents, cost_cents]) => ({ id: uid(), name, description, category, unit_cents, cost_cents }));

  const estSeed: [number, string, EstimateStatus, number, LineItem[]][] = [
    [1, "Whole-home repipe (PEX)", "sent", -4, [{ description: "PEX repipe, 2 bath", qty: 1, unit_cents: 685000 }, { description: "Drywall patch allowance", qty: 1, unit_cents: 120000 }]],
    [4, "Replace 3-ton AC condenser", "approved", -9, [{ description: "3-ton condenser + coil", qty: 1, unit_cents: 420000 }, { description: "Labor (hrs)", qty: 8, unit_cents: 12500 }]],
    [2, "EV charger install (240V)", "sent", -2, [{ description: "EV charger install (240V)", qty: 1, unit_cents: 79500 }, { description: "Permit + inspection", qty: 1, unit_cents: 22500 }]],
    [6, "Tankless water heater upgrade", "draft", 0, [{ description: "Tankless water heater", qty: 1, unit_cents: 185000 }, { description: "Gas line + venting", qty: 1, unit_cents: 62000 }, { description: "Labor (hrs)", qty: 6, unit_cents: 12500 }]],
    [0, "Kitchen remodel rough-in plumbing", "declined", -15, [{ description: "Rough-in plumbing", qty: 1, unit_cents: 310000 }]],
    [3, "Attic fan + wiring", "approved", -12, [{ description: "Attic fan", qty: 1, unit_cents: 38000 }, { description: "Wiring + labor", qty: 4, unit_cents: 13500 }]],
    [5, "Backflow test + repair", "sent", -6, [{ description: "Backflow test", qty: 1, unit_cents: 19500 }, { description: "Repair parts + labor", qty: 2, unit_cents: 12500 }]],
  ];
  const estimates: Estimate[] = estSeed.map(([ci, title, status, ago, items], n) => ({
    id: uid(), number: 2001 + n, customer_id: cust(ci).id, title, status, items, tax_rate: taxRate,
    issued_at: rel(ago, 9), valid_until: rel(ago + 30, 9), notes: "", job_id: null, invoice_id: null,
  }));

  const leadSeed: [string, string, string, number, LeadStage, number][] = [
    ["Rosa Martinez", "Google", "Tankless water heater quote", 320000, "new", -1],
    ["Kevin Tran", "Website", "AC replacement, 2-story home", 980000, "new", 0],
    ["Hillcrest HOA", "Referral", "Annual backflow testing (12 units)", 240000, "contacted", -3],
    ["Nina Patel", "Yelp", "Panel upgrade + EV charger", 540000, "contacted", -5],
    ["Oakridge Dental", "Referral", "Maintenance plan, 3 rooftop units", 360000, "send_quote", -7],
    ["Sam Whitfield", "Nextdoor", "Whole-house repipe", 1150000, "quote_sent", -9],
    ["Linda Brooks", "Google", "Water heater replacement", 189000, "work_order", -12],
    ["Mike Duran", "Yelp", "Mini-split for garage", 410000, "work_order", -14],
    ["Pete Hanley", "Nextdoor", "Sewer line camera inspection", 45000, "declined", -10],
  ];
  const leads: Lead[] = leadSeed.map(([name, source, service, value_cents, stage, ago], n) => ({
    id: uid(), name, phone: "(916) 555-02" + String(10 + n * 7), email: name.split(" ")[0].toLowerCase() + "@example.com",
    address: "", source, service, value_cents, stage, notes: stage === "declined" ? "Declined: Price too high" : "", customer_id: null, estimate_id: null, job_id: null, created_at: rel(ago, 11),
  }));

  const planSeed: [number, string, string, number, number, number, ServicePlan["status"]][] = [
    [0, "Comfort Club (HVAC)", "Spring/fall HVAC tune-up", 14900, 6, 9, "active"],
    [1, "Water heater care", "Annual water heater flush", 12900, 12, -3, "active"],
    [2, "Commercial filter plan", "Quarterly HVAC filter service", 18900, 3, 21, "active"],
    [5, "Commercial filter plan", "Quarterly HVAC filter service", 18900, 3, 40, "active"],
    [7, "Electrical safety check", "Annual electrical safety inspection", 17900, 12, 120, "active"],
    [4, "Comfort Club (HVAC)", "Spring/fall HVAC tune-up", 14900, 6, 60, "paused"],
  ];
  const service_plans: ServicePlan[] = planSeed.map(([ci, name, visit_title, price_cents, interval_months, inDays, status]) => ({
    id: uid(), customer_id: cust(ci).id, name, visit_title, price_cents, interval_months,
    next_visit: addDays(today, inDays).toISOString().slice(0, 10), status, notes: "",
  }));

  const techByName = new Map(team.map((t) => [t.name, t]));
  const time_entries: TimeEntry[] = [];
  for (const j of jobs) {
    const m = techByName.get(j.assigned_to);
    if (!m) continue;
    if (j.status === "completed") time_entries.push({ id: uid(), member_id: m.id, job_id: j.id, start_at: j.start_at, end_at: j.end_at, note: "" });
    else if (j.status === "in_progress" && new Date(j.start_at).getTime() <= Date.now()) time_entries.push({ id: uid(), member_id: m.id, job_id: j.id, start_at: j.start_at, end_at: null, note: "" });
  }

  const mats: Record<string, [string, LineItem[]]> = {
    "Water heater replacement (40 gal)": ["Ferguson", [{ description: "40 gal gas water heater", qty: 1, unit_cents: 52000 }, { description: "Install kit + venting", qty: 1, unit_cents: 6500 }]],
    "Panel upgrade 100A to 200A": ["Rexel", [{ description: "200A panel + breakers", qty: 1, unit_cents: 71000 }]],
    "Install 6 recessed lights": ["Rexel", [{ description: "LED recessed light", qty: 6, unit_cents: 1400 }]],
    "Mini-split install (2-ton)": ["Johnstone Supply", [{ description: "2-ton mini-split system", qty: 1, unit_cents: 141000 }, { description: "Line set + electrical", qty: 1, unit_cents: 17000 }]],
    "AC not cooling - diagnostic + repair": ["Johnstone Supply", [{ description: "Capacitor (dual run)", qty: 1, unit_cents: 2200 }]],
  };
  const purchase_orders: PurchaseOrder[] = [];
  for (const j of jobs) {
    const m = mats[j.title];
    if (!m || j.status === "canceled") continue;
    const future = new Date(j.start_at).getTime() > Date.now();
    if (future && r() < 0.4) continue;
    purchase_orders.push({
      id: uid(), number: 5001 + purchase_orders.length, vendor: m[0], job_id: j.id,
      status: future ? (r() < 0.5 ? "ordered" : "draft") : "received",
      items: m[1], ordered_at: addDays(new Date(j.start_at), -2).toISOString(),
      expected_at: addDays(new Date(j.start_at), -1).toISOString(), notes: "",
    });
  }

  return {
    business: {
      name: "Summit Home Services",
      phone: "(916) 555-0100",
      email: "office@summithome.example.com",
      tax_rate: taxRate,
      qbo_connected: false,
      qbo_company: null,
      stripe_connected: false,
      logo: null,
    },
    customers,
    jobs,
    invoices,
    payments,
    rows: { price_items, estimates, leads, service_plans, team_members: team, time_entries, purchase_orders },
  };
}

function load(): DB {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as DB;
  } catch {
    /* fall through to a fresh seed */
  }
  const db = seed();
  persist(db);
  return db;
}

function persist(db: DB) {
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
  } catch {
    /* private mode etc: demo just won't persist */
  }
}

export const resetDemoData = () => {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
};

const wait = <T,>(v: T) => new Promise<T>((res) => setTimeout(() => res(v), 60));

function upsert<T extends { id: string }>(list: T[], item: New<T>): T {
  const full = { ...item, id: item.id ?? uid() } as T;
  const i = list.findIndex((x) => x.id === full.id);
  if (i >= 0) list[i] = full;
  else list.push(full);
  return full;
}

export function createDemoStore(): Store {
  let db = load();
  const save = () => persist(db);

  return {
    mode: "demo",

    async getBusiness() {
      return wait({ ...db.business });
    },
    async saveBusiness(patch) {
      db.business = { ...db.business, ...patch };
      save();
      return wait({ ...db.business });
    },

    async listCustomers() {
      return wait([...db.customers].sort((a, b) => a.name.localeCompare(b.name)));
    },
    async saveCustomer(c) {
      const out = upsert(db.customers, c);
      save();
      return wait(out);
    },

    async listJobs() {
      return wait([...db.jobs]);
    },
    async saveJob(j) {
      const out = upsert(db.jobs, j);
      save();
      return wait(out);
    },
    async deleteCustomer(id) {
      db.customers = db.customers.filter((c) => c.id !== id);
      db.jobs = db.jobs.filter((j) => j.customer_id !== id);
      db.invoices = db.invoices.filter((i) => i.customer_id !== id);
      save();
      await wait(null);
    },
    async deleteInvoice(id) {
      db.invoices = db.invoices.filter((i) => i.id !== id);
      db.payments = db.payments.filter((p) => p.invoice_id !== id);
      for (const e of (db.rows.estimates ?? []) as { invoice_id: string | null }[]) if (e.invoice_id === id) e.invoice_id = null;
      save();
      await wait(null);
    },
    async deleteJob(id) {
      db.jobs = db.jobs.filter((j) => j.id !== id);
      save();
      await wait(null);
    },

    async listInvoices() {
      return wait([...db.invoices]);
    },
    async saveInvoice(i) {
      const out = upsert(db.invoices, i);
      save();
      return wait(out);
    },

    async listPayments() {
      return wait([...db.payments]);
    },
    async recordPayment(p) {
      const pay: Payment = { id: uid(), paid_at: new Date().toISOString(), ...p };
      db.payments.push(pay);
      const inv = db.invoices.find((x) => x.id === p.invoice_id);
      if (inv && amountPaid(inv.id, db.payments) >= invoiceTotals(inv).total) {
        inv.status = "paid";
        const job = db.jobs.find((j) => j.id === inv.job_id);
        if (job && job.status !== "canceled") job.status = "completed";
        for (const l of (db.rows.leads ?? []) as { job_id: string | null; stage: string }[]) if (inv.job_id && l.job_id === inv.job_id && l.stage === "work_order") l.stage = "completed";
      }
      save();
      return wait(pay);
    },

    async listRows(name) {
      return wait([...((db.rows[name] ?? []) as unknown[])] as never);
    },
    async saveRow(name, row) {
      const arr = (db.rows[name] ??= [] as never) as unknown as { id: string }[];
      const out = upsert(arr, row as never);
      save();
      return wait(out as never);
    },
    async deleteRow(name, id) {
      db.rows[name] = ((db.rows[name] ?? []) as { id: string }[]).filter((x) => x.id !== id) as never;
      save();
      await wait(null);
    },

    async createPayLink(invoiceId) {
      // Demo mode has no real checkout page; the UI shows a simulated payment sheet instead.
      return wait({ url: `${location.origin}/pay/demo/${invoiceId}`, demo: true });
    },

    async qboConnect() {
      db.business.qbo_connected = true;
      db.business.qbo_company = "Summit Home Services (demo company)";
      save();
      await wait(null);
    },
    async qboDisconnect() {
      db.business.qbo_connected = false;
      db.business.qbo_company = null;
      save();
      await wait(null);
    },
    async qboSyncInvoice(invoiceId) {
      const inv = db.invoices.find((x) => x.id === invoiceId);
      if (!inv) throw new Error("Invoice not found");
      inv.qbo_id = String(8000 + inv.number);
      save();
      return wait({ qbo_id: inv.qbo_id });
    },

    async stripeConnect() {
      db.business.stripe_connected = true;
      save();
      await wait(null);
    },
  };
}
