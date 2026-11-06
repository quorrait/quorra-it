import type { Store } from "./store";
import type { Customer, Invoice, Job, LeadStage, PriceCategory, Role } from "./types";

export type EntityKey = "customers" | "price_items" | "leads" | "jobs" | "team" | "invoices";

export interface Ctx { customers: Customer[]; invoices: Invoice[]; jobs: Job[]; store: Store }
export interface Field { key: string; label: string; aliases: string[]; required?: boolean; example: string }
export interface Entity {
  key: EntityKey;
  label: string;
  hint: string;
  fields: Field[];
  /** Validate and normalise one row. Returns an error string or an object that `save` understands. */
  build(r: Record<string, string>, ctx: Ctx): { error: string } | { value: Record<string, unknown>; dup?: boolean };
  save(v: Record<string, unknown>, ctx: Ctx): Promise<void>;
}

const num = (s: string) => parseFloat((s ?? "").replace(/[$,\s]/g, "")) || 0;
const cents = (s: string) => Math.round(num(s) * 100);

/** Accepts 2026-11-06 or 11/6/2026 or 11/6/26. Returns YYYY-MM-DD or null. */
export function parseDate(s: string): string | null {
  const t = (s ?? "").trim();
  if (!t) return null;
  let y: number, m: number, d: number;
  let x = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t);
  if (x) { y = +x[1]; m = +x[2]; d = +x[3]; }
  else if ((x = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/.exec(t))) { m = +x[1]; d = +x[2]; y = +x[3] < 100 ? 2000 + +x[3] : +x[3]; }
  else return null;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
/** "9:30 AM", "14:00", "9am" -> "HH:MM" */
export function parseTime(s: string): string {
  const x = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i.exec((s ?? "").trim());
  if (!x) return "09:00";
  let h = +x[1]; const mm = x[2] ?? "00";
  if (x[3]?.toLowerCase() === "pm" && h < 12) h += 12;
  if (x[3]?.toLowerCase() === "am" && h === 12) h = 0;
  return `${String(h).padStart(2, "0")}:${mm}`;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const findCustomer = (ctx: Ctx, name: string) => ctx.customers.find((c) => norm(c.name) === norm(name));
async function ensureCustomer(ctx: Ctx, name: string, extra: Partial<Customer> = {}) {
  let c = findCustomer(ctx, name);
  if (!c) {
    c = await ctx.store.saveCustomer({ name: name.trim(), phone: extra.phone ?? "", email: extra.email ?? "", address: extra.address ?? "", notes: "" });
    ctx.customers.push(c);
  }
  return c;
}

const CATS: PriceCategory[] = ["Labor", "Material", "Service", "Equipment"];
const ROLES: Role[] = ["Owner", "Manager", "Office", "Sales", "Technician"];
const STAGES: LeadStage[] = ["new", "contacted", "quoted", "won", "lost"];
const pick = <T extends string>(list: readonly T[], v: string, fallback: T): T => list.find((x) => x.toLowerCase() === (v ?? "").trim().toLowerCase()) ?? fallback;

export const ENTITIES: Entity[] = [
  {
    key: "customers", label: "Customers", hint: "Works with QuickBooks, Housecall Pro and FieldPulse customer exports.",
    fields: [
      { key: "name", label: "Name", aliases: ["name", "customer", "display name", "full name", "company", "customer name"], required: true, example: "Jane Smith" },
      { key: "phone", label: "Phone", aliases: ["phone", "mobile", "phone numbers", "main phone", "cell"], example: "(916) 555-0100" },
      { key: "email", label: "Email", aliases: ["email", "e-mail", "email address"], example: "jane@example.com" },
      { key: "address", label: "Address", aliases: ["address", "billing address", "street", "service address", "street address"], example: "12 Oak St, Lincoln, CA" },
      { key: "notes", label: "Notes", aliases: ["notes", "note", "memo"], example: "Gate code 1234" },
    ],
    build(r, ctx) {
      if (!r.name?.trim()) return { error: "Missing name" };
      const dup = ctx.customers.some((c) => (r.email && c.email && c.email.toLowerCase() === r.email.toLowerCase()) || norm(c.name) === norm(r.name));
      return { value: { name: r.name.trim(), phone: r.phone ?? "", email: r.email ?? "", address: r.address ?? "", notes: r.notes ?? "" }, dup };
    },
    async save(v, ctx) { const c = await ctx.store.saveCustomer(v as never); ctx.customers.push(c); },
  },
  {
    key: "price_items", label: "Price book", hint: "Services, labor and parts with price and your cost.",
    fields: [
      { key: "name", label: "Name", aliases: ["name", "item", "service", "product", "item name", "product/service name"], required: true, example: "Capacitor" },
      { key: "description", label: "Description", aliases: ["description", "details", "sales description"], example: "Run/start capacitor" },
      { key: "category", label: "Category (Labor, Material, Service, Equipment)", aliases: ["category", "type"], example: "Material" },
      { key: "price", label: "Customer price", aliases: ["price", "unit price", "rate", "sales price", "customer price"], required: true, example: "85.00" },
      { key: "cost", label: "Your cost", aliases: ["cost", "unit cost", "purchase cost"], example: "18.00" },
    ],
    build(r) {
      if (!r.name?.trim()) return { error: "Missing name" };
      if (!/\d/.test(r.price ?? "")) return { error: "Missing price" };
      return { value: { name: r.name.trim(), description: r.description ?? "", category: pick(CATS, r.category, "Service"), unit_cents: cents(r.price), cost_cents: cents(r.cost) } };
    },
    async save(v, ctx) { await ctx.store.saveRow("price_items", v as never); },
  },
  {
    key: "leads", label: "Leads", hint: "Stage can be new, contacted, quoted, won or lost.",
    fields: [
      { key: "name", label: "Name", aliases: ["name", "lead", "contact", "customer"], required: true, example: "Hillcrest HOA" },
      { key: "phone", label: "Phone", aliases: ["phone", "mobile"], example: "(916) 555-0140" },
      { key: "email", label: "Email", aliases: ["email"], example: "board@hillcrest.example.com" },
      { key: "address", label: "Address", aliases: ["address"], example: "" },
      { key: "service", label: "What they need", aliases: ["service", "need", "description", "request", "job"], example: "Backflow testing" },
      { key: "value", label: "Estimated value", aliases: ["value", "amount", "estimate", "est value"], example: "2400" },
      { key: "source", label: "Source", aliases: ["source", "lead source", "referral"], example: "Referral" },
      { key: "stage", label: "Stage", aliases: ["stage", "status"], example: "new" },
      { key: "notes", label: "Notes", aliases: ["notes"], example: "" },
    ],
    build(r) {
      if (!r.name?.trim()) return { error: "Missing name" };
      return { value: { name: r.name.trim(), phone: r.phone ?? "", email: r.email ?? "", address: r.address ?? "", source: r.source || "Other", service: r.service ?? "", value_cents: cents(r.value), stage: pick(STAGES, r.stage, "new"), notes: r.notes ?? "", customer_id: null, created_at: new Date().toISOString() } };
    },
    async save(v, ctx) { await ctx.store.saveRow("leads", v as never); },
  },
  {
    key: "jobs", label: "Jobs", hint: "Customers are matched by name, and created if they don't exist yet.",
    fields: [
      { key: "customer", label: "Customer", aliases: ["customer", "customer name", "client", "name"], required: true, example: "Jane Smith" },
      { key: "title", label: "Job title", aliases: ["title", "job", "job title", "description", "service"], required: true, example: "AC tune-up" },
      { key: "date", label: "Date", aliases: ["date", "start date", "scheduled", "day"], required: true, example: "2026-11-20" },
      { key: "time", label: "Start time", aliases: ["time", "start time", "start"], example: "9:00 AM" },
      { key: "hours", label: "Hours", aliases: ["hours", "duration", "length"], example: "2" },
      { key: "address", label: "Job address", aliases: ["address", "job address", "location"], example: "" },
      { key: "assigned_to", label: "Assigned to", aliases: ["assigned to", "technician", "tech", "assignee", "crew"], example: "Jake Ramirez" },
      { key: "status", label: "Status (scheduled, in_progress, completed, canceled)", aliases: ["status"], example: "scheduled" },
      { key: "notes", label: "Notes", aliases: ["notes", "instructions"], example: "" },
    ],
    build(r) {
      if (!r.customer?.trim()) return { error: "Missing customer" };
      if (!r.title?.trim()) return { error: "Missing job title" };
      const d = parseDate(r.date);
      if (!d) return { error: "Date not recognised (use 2026-11-20 or 11/20/2026)" };
      return { value: { customer: r.customer.trim(), title: r.title.trim(), date: d, time: parseTime(r.time), hours: num(r.hours) || 2, address: r.address ?? "", assigned_to: r.assigned_to ?? "", status: pick(["scheduled", "in_progress", "completed", "canceled"] as const, (r.status ?? "").replace(" ", "_"), "scheduled"), notes: r.notes ?? "" } };
    },
    async save(v, ctx) {
      const c = await ensureCustomer(ctx, v.customer as string, { address: v.address as string });
      const start = new Date(`${v.date}T${v.time}:00`);
      await ctx.store.saveJob({
        customer_id: c.id, title: v.title as string, description: v.notes as string, address: (v.address as string) || c.address, status: v.status as Job["status"],
        start_at: start.toISOString(), end_at: new Date(start.getTime() + (v.hours as number) * 3600_000).toISOString(), assigned_to: v.assigned_to as string,
      });
    },
  },
  {
    key: "team", label: "Team members", hint: "Role: Owner, Manager, Office, Sales or Technician.",
    fields: [
      { key: "name", label: "Name", aliases: ["name", "employee", "full name"], required: true, example: "Jake Ramirez" },
      { key: "role", label: "Role", aliases: ["role", "title", "position"], example: "Technician" },
      { key: "phone", label: "Phone", aliases: ["phone", "mobile"], example: "" },
      { key: "email", label: "Email (used to match their login)", aliases: ["email"], example: "jake@yourco.com" },
      { key: "hourly", label: "Hourly cost", aliases: ["hourly", "hourly cost", "rate", "wage", "pay rate"], example: "32" },
      { key: "commission", label: "Commission %", aliases: ["commission", "commission %", "commission pct"], example: "8" },
    ],
    build(r) {
      if (!r.name?.trim()) return { error: "Missing name" };
      return { value: { name: r.name.trim(), role: pick(ROLES, r.role, "Technician"), phone: r.phone ?? "", email: r.email ?? "", hourly_cents: cents(r.hourly), commission_pct: num(r.commission), color: "#e8590c", active: true } };
    },
    async save(v, ctx) { await ctx.store.saveRow("team_members", v as never); },
  },
  {
    key: "invoices", label: "Past invoices", hint: "Bring over history from QuickBooks or another tool. Each becomes one line item for the total.",
    fields: [
      { key: "number", label: "Invoice #", aliases: ["number", "invoice", "invoice #", "invoice number", "no.", "num"], required: true, example: "1001" },
      { key: "customer", label: "Customer", aliases: ["customer", "customer name", "name", "client"], required: true, example: "Jane Smith" },
      { key: "date", label: "Invoice date", aliases: ["date", "invoice date", "issued"], required: true, example: "2026-09-12" },
      { key: "due", label: "Due date", aliases: ["due", "due date"], example: "2026-09-26" },
      { key: "total", label: "Total (with tax)", aliases: ["total", "amount", "invoice total", "total amount"], required: true, example: "537.86" },
      { key: "paid", label: "Amount paid", aliases: ["paid", "amount paid", "payments", "paid amount"], example: "537.86" },
      { key: "description", label: "Description", aliases: ["description", "memo", "service"], example: "HVAC repair" },
    ],
    build(r, ctx) {
      const n = parseInt(r.number ?? "", 10);
      if (!n) return { error: "Missing invoice number" };
      if (!r.customer?.trim()) return { error: "Missing customer" };
      const d = parseDate(r.date);
      if (!d) return { error: "Invoice date not recognised" };
      if (!/\d/.test(r.total ?? "")) return { error: "Missing total" };
      return { value: { number: n, customer: r.customer.trim(), date: d, due: parseDate(r.due) ?? d, total_cents: cents(r.total), paid_cents: cents(r.paid), description: r.description || `Imported invoice #${n}` }, dup: ctx.invoices.some((i) => i.number === n) };
    },
    async save(v, ctx) {
      const c = await ensureCustomer(ctx, v.customer as string);
      const total = v.total_cents as number, paid = Math.min(total, v.paid_cents as number);
      const inv = await ctx.store.saveInvoice({
        number: v.number as number, customer_id: c.id, job_id: null, status: "sent",
        items: [{ description: v.description as string, qty: 1, unit_cents: total }], tax_rate: 0,
        issued_at: new Date(`${v.date}T12:00:00`).toISOString(), due_at: new Date(`${v.due}T12:00:00`).toISOString(), qbo_id: null,
      });
      ctx.invoices.push(inv);
      if (paid > 0) await ctx.store.recordPayment({ invoice_id: inv.id, amount_cents: paid, method: "other" });
    },
  },
];

export const autoMap = (entity: Entity, headers: string[]): Record<string, number> => {
  const m: Record<string, number> = {};
  const used = new Set<number>();
  for (const f of entity.fields) {
    const idx = headers.findIndex((h, i) => !used.has(i) && f.aliases.includes(h.trim().toLowerCase()));
    if (idx >= 0) { m[f.key] = idx; used.add(idx); }
  }
  return m;
};

export const templateCsv = (e: Entity): string[][] => [e.fields.map((f) => f.aliases[0]), e.fields.map((f) => f.example)];
