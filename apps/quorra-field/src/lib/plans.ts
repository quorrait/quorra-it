export interface Plan {
  id: "solo" | "crew" | "company";
  name: string;
  price_cents: number;
  seats: number; // people who can sign in
  tagline: string;
  extras: string[];
  popular?: boolean;
}

/** Prices and seat counts are set here. Stripe prices are matched by id in the billing-checkout function. */
export const PLANS: Plan[] = [
  { id: "solo", name: "Solo", price_cents: 30000, seats: 1, tagline: "For a one-person shop", extras: ["1 login (the owner)", "Email support"] },
  { id: "crew", name: "Crew", price_cents: 45000, seats: 5, tagline: "For a small crew", popular: true, extras: ["Up to 5 logins with roles", "Technician view of their own jobs", "Timesheets and commission tracking", "Priority email support"] },
  { id: "company", name: "Company", price_cents: 65000, seats: 15, tagline: "For a growing company", extras: ["Up to 15 logins with roles", "Everything in Crew", "Onboarding call and data import help", "Phone support"] },
];

export const EVERY_PLAN = [
  "Calendar and job scheduling with phone calendar sync",
  "Estimates and invoices with PDF, email and text",
  "Card payments on your own Stripe account",
  "QuickBooks Online sync",
  "Website lead form and lead pipeline",
  "Local price guide on every quote",
  "Price book, templates and CSV imports",
  "Earnings by day, week, month and year",
];

export const planByName = (name?: string | null) => PLANS.find((p) => p.name.toLowerCase() === (name ?? "").toLowerCase());
