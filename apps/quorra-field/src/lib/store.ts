import type { Business, CollectionName, Collections, Customer, Invoice, Job, New, Payment, PayMethod } from "./types";

/** Everything the UI needs from a backend. Two implementations: demo (browser) and Supabase. */
export interface Store {
  mode: "demo" | "supabase";

  getBusiness(): Promise<Business>;
  saveBusiness(patch: Partial<Business>): Promise<Business>;

  listCustomers(): Promise<Customer[]>;
  saveCustomer(c: New<Customer>): Promise<Customer>;

  listJobs(): Promise<Job[]>;
  saveJob(j: New<Job>): Promise<Job>;
  deleteJob(id: string): Promise<void>;
  deleteInvoice(id: string): Promise<void>;
  deleteCustomer(id: string): Promise<void>;

  listInvoices(): Promise<Invoice[]>;
  saveInvoice(i: New<Invoice>): Promise<Invoice>;

  listPayments(): Promise<Payment[]>;
  recordPayment(p: { invoice_id: string; amount_cents: number; method: PayMethod }): Promise<Payment>;

  /** Generic access for the newer collections (estimates, leads, team, ...). */
  listRows<K extends CollectionName>(name: K): Promise<Collections[K][]>;
  saveRow<K extends CollectionName>(name: K, row: New<Collections[K]>): Promise<Collections[K]>;
  deleteRow(name: CollectionName, id: string): Promise<void>;

  /** Hosted card-payment page the customer can open or scan. */
  createPayLink(invoiceId: string): Promise<{ url: string; demo: boolean }>;

  /** Start QuickBooks Online connection (redirects to Intuit in live mode). */
  qboConnect(): Promise<void>;
  qboDisconnect(): Promise<void>;
  qboSyncInvoice(invoiceId: string): Promise<{ qbo_id: string }>;

  /** Start Stripe onboarding so card payments land in the contractor's own account. */
  stripeConnect(): Promise<void>;
}

export const uid = () =>
  (globalThis.crypto && "randomUUID" in globalThis.crypto
    ? globalThis.crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36));
