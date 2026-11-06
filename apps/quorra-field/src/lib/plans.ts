export interface Plan {
  id: "basic" | "essentials" | "enterprise";
  name: string;
  price_cents: number;
  seats: number; // people who can sign in
  tagline: string;
  extras: string[];
  popular?: boolean;
}

export const TRIAL_DAYS = 14;

/** Monthly prices. What is actually charged comes from the Stripe price ids set as STRIPE_PRICE_BASIC / _ESSENTIALS / _ENTERPRISE. */
export const PLANS: Plan[] = [
  { id: "basic", name: "Basic", price_cents: 8000, seats: 1, tagline: "For a one-person shop", extras: ["1 login (the owner)", "Online booking form for your website", "Estimates and invoices", "Scheduling and phone calendar sync", "Card payments and price book", "Email support"] },
  { id: "essentials", name: "Essentials", price_cents: 15000, seats: 5, tagline: "For a small crew", popular: true, extras: ["Everything in Basic", "Up to 5 logins with roles", "Technician view of their own jobs", "On my way and arrived check-ins with location", "Customer portal for quotes, invoices and payments", "Timesheets and commission tracking", "QuickBooks Online sync", "Local price guide on every quote", "Priority email support"] },
  { id: "enterprise", name: "Enterprise", price_cents: 30000, seats: 15, tagline: "For a growing company", extras: ["Everything in Essentials", "Up to 15 logins with roles", "Advanced reports", "Recurring service plans", "Onboarding call and data import help", "Phone support"] },
];

export const EVERY_PLAN = [
  "Job scheduling and calendar",
  "Estimates and invoices with PDF, email and text",
  "Card payments on your own Stripe account",
  "Website lead form and lead pipeline",
  "Price book, templates and CSV imports",
  "Earnings by day, week, month and year",
];

export const planByName = (name?: string | null) => PLANS.find((p) => p.name.toLowerCase() === (name ?? "").toLowerCase());
