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

export type Interval = "month" | "year";
export const ANNUAL_DISCOUNT = 10; // percent off when paying for the year up front
/** Yearly price: 12 months with the discount taken off. */
export const annualCents = (p: { price_cents: number }) => Math.round(p.price_cents * 12 * (1 - ANNUAL_DISCOUNT / 100));

/** Monthly prices. What is actually charged comes from the Stripe price ids set as STRIPE_PRICE_BASIC / _ESSENTIALS / _ENTERPRISE. */
export const PLANS: Plan[] = [
  { id: "basic", name: "Basic", price_cents: 8000, seats: 1, tagline: "For a one-person shop", extras: ["1 login (the owner)", "Email support"] },
  { id: "essentials", name: "Essentials", price_cents: 19000, seats: 5, tagline: "For a small crew", popular: true, extras: ["Everything in Basic", "Up to 5 logins with roles", "Technicians see their own jobs", "Priority email support"] },
  { id: "enterprise", name: "Enterprise", price_cents: 30000, seats: 15, tagline: "For a growing company", extras: ["Everything in Essentials", "Up to 15 logins with roles", "Onboarding call and data import help", "Phone support"] },
];

/** Custom plan: more than 15 logins. Quoted by email, not bought online. Price per technician above the 15 included, per month. */
export const CUSTOM_PLAN = {
  name: "Custom",
  tagline: "For crews of more than 15",
  per_tech_cents: 2000,
  contact_email: "quorrait@gmail.com",
  extras: ["Everything in Enterprise", "Your 15 logins plus a flat rate for each technician after that", "Onboarding call and data import help", "Phone support"],
};

export const EVERY_PLAN = [
  "Job scheduling and calendar",
  "Estimates and invoices with PDF, email and text",
  "Card payments on your own Stripe account",
  "QuickBooks Online sync",
  "Website lead form and lead pipeline",
  "Your own HTML invoice layout and lead form",
  "Customer portal for quotes, invoices and payments",
  "On my way and arrived check-ins",
  "Timesheets and commission tracking",
  "Reports, earnings and recurring service plans",
  "Price book, local price guide and CSV imports",
  "Phone calendar sync",
];

export const planByName = (name?: string | null) => PLANS.find((p) => p.name.toLowerCase() === (name ?? "").toLowerCase());
