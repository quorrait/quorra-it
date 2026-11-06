import type { Role } from "./types";

export type Feature =
  | "money" | "calendar" | "jobs" | "customers" | "leads" | "estimates" | "invoices"
  | "pricebook" | "templates" | "import" | "plans" | "purchase_orders" | "team" | "timesheets" | "reports" | "settings" | "billing";

const ALL: Feature[] = ["money", "calendar", "jobs", "customers", "leads", "estimates", "invoices", "pricebook", "templates", "import", "plans", "purchase_orders", "team", "timesheets", "reports", "settings", "billing"];

/** Owners and Managers see everything. Everyone else gets only what their job needs. */
export const ACCESS: Record<Role, Feature[]> = {
  Owner: ALL,
  Manager: ALL.filter((f) => f !== "billing"),
  Office: ["calendar", "jobs", "customers", "leads", "estimates", "invoices", "pricebook", "templates", "import", "plans", "purchase_orders"],
  Sales: ["calendar", "jobs", "customers", "leads", "estimates", "pricebook", "templates"],
  Technician: ["calendar", "jobs", "customers"],
};

export const canAccess = (role: Role, f: Feature) => ACCESS[role].includes(f);
export const isManager = (role: Role) => role === "Owner" || role === "Manager";

/** Route path -> feature required */
export const ROUTE_FEATURE: Record<string, Feature> = {
  "/leads": "leads", "/estimates": "estimates", "/pricebook": "pricebook", "/templates": "templates", "/import": "import", "/plans": "plans",
  "/purchase-orders": "purchase_orders", "/team": "team", "/timesheets": "timesheets", "/reports": "reports",
  "/settings": "settings", "/billing": "billing", "/invoices": "invoices", "/customers": "customers",
};
