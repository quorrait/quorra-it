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

/** The owner can change what each role sees (stored on the business). Owner always sees everything; only the owner sees Billing. */
export type RoleAccess = Partial<Record<Role, Feature[]>>;
export const FEATURE_LABEL: Record<Feature, string> = {
  money: "Money and totals", calendar: "Calendar", jobs: "Jobs", customers: "Customers", leads: "Leads", estimates: "Estimates", invoices: "Invoices",
  pricebook: "Price book", templates: "Templates", import: "Import", plans: "Service plans", purchase_orders: "Purchase orders", team: "Team",
  timesheets: "Timesheets", reports: "Reports", settings: "Settings", billing: "Billing",
};
export const EDITABLE: Feature[] = ALL.filter((f) => f !== "billing");
export const canAccess = (role: Role, f: Feature, custom?: RoleAccess | null) => {
  if (role === "Owner") return true;
  if (f === "billing") return false;
  const list = custom?.[role];
  return (list ?? ACCESS[role]).includes(f);
};
export const isManager = (role: Role) => role === "Owner" || role === "Manager";

/** Route path -> feature required */
export const ROUTE_FEATURE: Record<string, Feature> = {
  "/leads": "leads", "/estimates": "estimates", "/pricebook": "pricebook", "/templates": "templates", "/import": "import", "/plans": "plans",
  "/purchase-orders": "purchase_orders", "/team": "team", "/timesheets": "timesheets", "/reports": "reports",
  "/settings": "settings", "/integrations": "settings", "/billing": "billing", "/invoices": "invoices", "/customers": "customers",
};
