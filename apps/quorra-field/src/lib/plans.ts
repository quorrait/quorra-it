import { SUPPORT_EMAIL } from "./publicUrl";

export interface Plan {
  id: "basic" | "essentials" | "enterprise";
  name: string;
  price_cents: number;
  seats: number; // people who can sign in
  tagline: string;
  extras: string[];
  popular?: boolean;
}

export type PlanId = Plan["id"];

/**
 * Features that are not on every plan. Core work (jobs, calendar, estimates,
 * invoices, payments, portal, leads, on-my-way, price book, CSV import, and
 * in-app notifications) is included on Basic and is not listed here.
 * Keep this list identical to plan_allows() in supabase/migrations/0039_plan_gating.sql.
 */
export type GatedFeature =
  | "booking"
  | "reminders"
  | "reschedule_texts"
  | "timesheets"
  | "purchase_orders"
  | "service_plans"
  | "qbo"
  | "custom_layout"
  | "reports"
  | "booking_rules";

const ESSENTIALS_FEATURES = ["booking", "reminders", "reschedule_texts", "timesheets", "purchase_orders", "service_plans"] as const satisfies readonly GatedFeature[];
const ENTERPRISE_ONLY = ["qbo", "custom_layout", "reports", "booking_rules"] as const satisfies readonly GatedFeature[];

export const PLAN_FEATURES: Record<PlanId, readonly GatedFeature[]> = {
  basic: [],
  essentials: ESSENTIALS_FEATURES,
  enterprise: [...ESSENTIALS_FEATURES, ...ENTERPRISE_ONLY],
};

export const PLAN_SEATS: Record<PlanId, number> = { basic: 1, essentials: 5, enterprise: 15 };

/** The cheapest plan that includes the feature. Used by upgrade prompts. */
export const FEATURE_PLAN: Record<GatedFeature, { id: PlanId; name: string }> = {
  booking: { id: "essentials", name: "Essentials" },
  reminders: { id: "essentials", name: "Essentials" },
  reschedule_texts: { id: "essentials", name: "Essentials" },
  timesheets: { id: "essentials", name: "Essentials" },
  purchase_orders: { id: "essentials", name: "Essentials" },
  service_plans: { id: "essentials", name: "Essentials" },
  qbo: { id: "enterprise", name: "Enterprise" },
  custom_layout: { id: "enterprise", name: "Enterprise" },
  reports: { id: "enterprise", name: "Enterprise" },
  booking_rules: { id: "enterprise", name: "Enterprise" },
};

export const seatLimit = (plan: PlanId) => PLAN_SEATS[plan];
export const planAllows = (plan: PlanId, feature: GatedFeature) => PLAN_FEATURES[plan].includes(feature);

/**
 * Map a stored plan name or Stripe price id to a plan.
 * Unknown values, including the old single-plan label "Quorra Dispatch", are Basic.
 * They are never unlimited. Comped accounts and Quorra staff are Enterprise.
 * A trial uses the plan the customer picked; pass that plan name through here.
 */
export function normalizePlanId(plan?: string | null, opts?: { comped?: boolean; staff?: boolean; priceIds?: Partial<Record<PlanId, string[]>> }): PlanId {
  if (opts?.comped || opts?.staff) return "enterprise";
  const raw = (plan ?? "").trim();
  const lower = raw.toLowerCase();
  if (lower === "basic" || lower === "essentials" || lower === "enterprise") return lower;
  if (opts?.priceIds) {
    for (const id of ["enterprise", "essentials", "basic"] as const) {
      if (opts.priceIds[id]?.includes(raw)) return id;
    }
  }
  return "basic";
}

/** Browser demo is Enterprise unless a demo-only preview is set. Real accounts use normalizePlanId. */
export function resolvePlanId(plan?: string | null, opts?: { comped?: boolean; staff?: boolean; demo?: boolean; priceIds?: Partial<Record<PlanId, string[]>> }): PlanId {
  if (opts?.demo) return "enterprise";
  return normalizePlanId(plan, opts);
}

export function planLabel(plan: PlanId): string {
  return PLANS.find((p) => p.id === plan)?.name ?? "Basic";
}

/** Exact copy when a downgrade would leave more active logins than the new plan allows. */
export function downgradeLoginMessage(activeLogins: number, target: PlanId): string | null {
  const limit = seatLimit(target);
  if (activeLogins <= limit) return null;
  return `You have ${activeLogins} logins; ${planLabel(target)} allows ${limit}. Deactivate ${activeLogins - limit} to switch.`;
}

export const TRIAL_DAYS = 14;

export type Interval = "month" | "year";
export const ANNUAL_DISCOUNT = 10; // percent off when paying for the year up front
/** Yearly price: 12 months with the discount taken off. */
export const annualCents = (p: { price_cents: number }) => Math.round(p.price_cents * 12 * (1 - ANNUAL_DISCOUNT / 100));

/** Monthly prices. What is actually charged comes from the Stripe price ids set as STRIPE_PRICE_BASIC / _ESSENTIALS / _ENTERPRISE. */
export const PLANS: Plan[] = [
  { id: "basic", name: "Basic", price_cents: 8000, seats: PLAN_SEATS.basic, tagline: "For a one-person shop", extras: [
    "1 login (the owner)",
    "Job scheduling and calendar, with phone sync",
    "Estimates and invoices by PDF, email, text or portal link",
    "Take payment on the spot: cash, check or card",
    "Card payments into your own Stripe account",
    "Customer portal for quotes, invoices and payments",
    "Website lead form and Leads",
    "On my way and arrived check-ins",
    "Price book, local price guide and CSV imports",
    "In-app and email notifications",
    "Email support",
  ] },
  { id: "essentials", name: "Essentials", price_cents: 19000, seats: PLAN_SEATS.essentials, tagline: "For a small crew", popular: true, extras: [
    "Everything in Basic, plus:",
    "Up to 5 logins with roles",
    "Customers book a time online after accepting a quote",
    "Text and email reminders for visits and service plans",
    "Reschedule a job and the customer is texted",
    "Timesheets with overtime, edit history and custom pay periods",
    "Purchase orders with preset vendors",
    "Recurring service plans",
    "Priority email support",
  ] },
  { id: "enterprise", name: "Enterprise", price_cents: 30000, seats: PLAN_SEATS.enterprise, tagline: "For a growing company", extras: [
    "Everything in Essentials, plus:",
    "Up to 15 logins with roles",
    "QuickBooks Online sync",
    "Your own invoice layout and lead form design",
    "Reports, earnings, commission and labor cost tracking",
    "Open hours and booking rules you control",
    "Onboarding call and data import help",
    "Phone support",
  ] },
];

/** Custom plan: more than 15 logins. Not bought online. Enterprise plus a flat rate for each extra login. */
export const CUSTOM_PLAN = {
  name: "Custom",
  tagline: "Custom — more than 15 logins: Enterprise + $20/mo per extra login, contact us",
  per_tech_cents: 2000,
  contact_email: SUPPORT_EMAIL,
  extras: ["Everything in Enterprise", "Your 15 logins plus a flat rate for each technician after that", "Onboarding call and data import help", "Phone support"],
};

export const EVERY_PLAN = [
  "Job scheduling and calendar, with phone calendar sync",
  "Customers book a time online after they accept a quote",
  "Estimates and invoices by PDF, email, text or portal link",
  "Take payment on the spot: cash, check or card",
  "Card payments into your own Stripe account (QR, link, Apple Pay, Google Pay)",
  "Customer portal for quotes, invoices and payments",
  "Text and email reminders for visits and service plans",
  "Reschedule a job and the customer is texted automatically",
  "In-app and email notifications for bookings and changes",
  "Website lead form and Leads",
  "Your own invoice layout and lead form design",
  "QuickBooks Online sync",
  "On my way and arrived check-ins",
  "Timesheets with overtime, edit history and custom pay periods",
  "Commission tracking and labor cost reports",
  "Purchase orders with preset vendors",
  "Price book, local price guide and CSV imports",
  "Recurring service plans",
  "Reports and earnings",
  "Open hours and booking rules you control",
];

export const planByName = (name?: string | null) => PLANS.find((p) => p.name.toLowerCase() === (name ?? "").toLowerCase());
