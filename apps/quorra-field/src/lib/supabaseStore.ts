import type { Business, CollectionName, Collections, Customer, Invoice, Job, New, Payment } from "./types";
import type { Store } from "./store";
import { supabase } from "./supabase";

const sb = () => {
  if (!supabase) throw new Error("Supabase is not configured");
  return supabase;
};

async function list<T>(table: string, orderBy: string, ascending = false): Promise<T[]> {
  const { data, error } = await sb().from(table).select("*").order(orderBy, { ascending });
  if (error) throw error;
  return (data ?? []) as T[];
}

async function upsert<T>(table: string, row: object): Promise<T> {
  const { data, error } = await sb().from(table).upsert(row).select().single();
  if (error) throw error;
  return data as T;
}

const DEFAULT_BUSINESS: Business = {
  name: "My Business",
  phone: "",
  email: "",
  tax_rate: 0,
  qbo_connected: false,
  qbo_company: null,
  stripe_connected: false,
  logo: null,
};

async function invoke<T>(fn: string, body: object): Promise<T> {
  const { data, error } = await sb().functions.invoke(fn, { body });
  if (error) throw error;
  if (data && typeof data === "object" && "error" in data) throw new Error(String((data as { error: unknown }).error));
  return data as T;
}

export function createSupabaseStore(): Store {
  return {
    mode: "supabase",

    async getBusiness() {
      const { data, error } = await sb().from("business").select("*").maybeSingle();
      if (error) throw error;
      if (data) return data as Business;
      // Only profile columns are writable by the client; connection flags come from server functions.
      const { phone, email, tax_rate } = DEFAULT_BUSINESS;
      const { data: u } = await sb().auth.getUser();
      const name = String(u.user?.user_metadata?.business_name || "").trim() || DEFAULT_BUSINESS.name;
      return upsert<Business>("business", { name, phone, email: u.user?.email ?? email, tax_rate });
    },
    async saveBusiness(patch) {
      const current = await this.getBusiness();
      // Connection flags are only ever changed by the server-side functions.
      const { qbo_connected: _q, qbo_company: _c, stripe_connected: _s, ...safe } = patch;
      void _q; void _c; void _s;
      const { data, error } = await sb()
        .from("business")
        .update({ ...safe })
        .not("owner_id", "is", null)
        .select()
        .single();
      if (error) throw error;
      return { ...current, ...(data as Business) };
    },

    listCustomers: () => list<Customer>("customers", "name", true),
    saveCustomer: (c: New<Customer>) => upsert<Customer>("customers", c),

    listJobs: () => list<Job>("jobs", "start_at", true),
    saveJob: (j: New<Job>) => upsert<Job>("jobs", j),
    async deleteJob(id) {
      const { error } = await sb().from("jobs").delete().eq("id", id);
      if (error) throw error;
    },

    async deleteCustomer(id) {
      const { error } = await sb().from("customers").delete().eq("id", id);
      if (error) throw error;
    },
    async deleteInvoice(id) {
      const { error } = await sb().from("invoices").delete().eq("id", id);
      if (error) throw error;
    },
    listInvoices: () => list<Invoice>("invoices", "number", false),
    saveInvoice: (i: New<Invoice>) => upsert<Invoice>("invoices", i),

    listPayments: () => list<Payment>("payments", "paid_at", false),
    // Manual payments (cash/check). Card payments are recorded by the Stripe webhook.
    async recordPayment(p) {
      const { data, error } = await sb().rpc("record_payment", {
        p_invoice_id: p.invoice_id,
        p_amount_cents: p.amount_cents,
        p_method: p.method,
      });
      if (error) throw error;
      return data as Payment;
    },

    async listRows<K extends CollectionName>(name: K) {
      const { data, error } = await sb().from(name).select("*");
      if (error) throw error;
      return (data ?? []) as Collections[K][];
    },
    saveRow: <K extends CollectionName>(name: K, row: New<Collections[K]>) => upsert<Collections[K]>(name, row),
    async deleteRow(name, id) {
      const { error } = await sb().from(name).delete().eq("id", id);
      if (error) throw error;
    },

    async createPayLink(invoiceId) {
      const { url } = await invoke<{ url: string }>("create-checkout", { invoice_id: invoiceId, origin: location.origin });
      return { url, demo: false };
    },

    async qboConnect() {
      const { url } = await invoke<{ url: string }>("qbo-auth-url", { origin: location.origin });
      location.href = url;
    },
    async qboDisconnect() {
      const { error } = await sb().rpc("disconnect_qbo");
      if (error) throw error;
    },
    qboSyncInvoice: (invoiceId) => invoke<{ qbo_id: string }>("qbo-sync-invoice", { invoice_id: invoiceId }),

    async stripeConnect() {
      const { url } = await invoke<{ url: string }>("stripe-connect-link", { origin: location.origin });
      location.href = url;
    },
  };
}
