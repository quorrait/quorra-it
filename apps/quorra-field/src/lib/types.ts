// Field names are snake_case so they map 1:1 to the Supabase tables.

export type JobStatus = "scheduled" | "in_progress" | "completed" | "canceled";
export type InvoiceStatus = "draft" | "sent" | "paid" | "void";
export type PayMethod = "card" | "cash" | "check" | "other";

export interface Business {
  name: string;
  phone: string;
  email: string;
  tax_rate: number; // percent, e.g. 7.75
  qbo_connected: boolean;
  qbo_company: string | null;
  stripe_connected: boolean;
  logo: string | null; // small data URL shown on printed invoices/estimates
  lead_key?: string | null; // public key for the website lead form
  calendar_token?: string | null; // private link for the all-jobs phone calendar feed
  state?: string | null; // two-letter state, used by the local price guide
  address?: string; // mailing address shown on invoices
  doc_settings?: DocSettings; // invoice and estimate layout
  yelp_url?: string; // Yelp review link, also used by "Ask for a review"
  review_url?: string; // Google review link, used by "Ask for a review"
  lead_form?: LeadFormSettings; // website request form wording and fields
  vendors?: Vendor[]; // preset vendors for purchase orders
  pay_period?: PayPeriod; // how timesheets are grouped
  hours?: BusinessHours; // open hours for customer scheduling
}
export interface Vendor { name: string; phone?: string; email?: string }
export interface PayPeriod { type?: "weekly" | "biweekly" | "semimonthly" | "monthly"; anchor?: string } // anchor: a date a period starts on (weekly/biweekly)
export interface DayHours { open: boolean; start: string; end: string } // "08:00" 24h
export interface BusinessHours { days?: DayHours[]; job_minutes?: number; buffer_minutes?: number; notice_hours?: number; max_days?: number; tz?: string } // days[0] = Sunday

export interface Customer {
  id: string;
  portal_token?: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
}

export interface Job {
  id: string;
  customer_id: string;
  title: string;
  description: string;
  address: string;
  status: JobStatus;
  start_at: string; // ISO
  end_at: string; // ISO
  assigned_to: string;
  started_at?: string | null; // when the tech pressed Start job
  actual_minutes?: number | null; // time it really took, entered at completion
  en_route_at?: string | null; en_route_lat?: number | null; en_route_lng?: number | null; // "On my way" check-in
  arrived_at?: string | null; arrived_lat?: number | null; arrived_lng?: number | null; // "Arrived" check-in
}

export interface LineItem {
  description: string;
  qty: number;
  unit_cents: number;
}

export interface Invoice {
  id: string;
  number: number;
  customer_id: string;
  job_id: string | null;
  status: InvoiceStatus;
  items: LineItem[];
  tax_rate: number; // percent applied to this invoice
  issued_at: string; // ISO
  due_at: string; // ISO
  qbo_id: string | null;
  notes?: string; // terms / message printed on the invoice
}

export interface Payment {
  id: string;
  invoice_id: string;
  amount_cents: number;
  method: PayMethod;
  paid_at: string; // ISO
}

export type New<T> = Omit<T, "id"> & { id?: string };

/* ---------------- Sales ---------------- */

export type EstimateStatus = "draft" | "sent" | "approved" | "declined";
export interface Estimate {
  id: string;
  number: number;
  customer_id: string;
  title: string;
  status: EstimateStatus;
  items: LineItem[];
  tax_rate: number;
  issued_at: string;
  valid_until: string;
  notes: string;
  job_id: string | null;
  invoice_id: string | null;
  public_token?: string; // lets the customer open and accept the quote from a link (live mode)
}

export type LeadStage = "new" | "contacted" | "send_quote" | "quote_sent" | "work_order" | "declined" | "completed";
export interface Lead {
  id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  source: string;
  service: string;
  value_cents: number;
  stage: LeadStage;
  notes: string;
  customer_id: string | null;
  estimate_id: string | null; // the quote built for this lead
  job_id: string | null; // the job on the calendar once accepted
  created_at: string;
}

export type PriceCategory = "Labor" | "Material" | "Service" | "Equipment";
export interface PriceItem {
  id: string;
  name: string;
  description: string;
  category: PriceCategory;
  unit_cents: number; // what the customer pays
  cost_cents: number; // what it costs you
}

/* ---------------- Operations ---------------- */

export interface ServicePlan {
  id: string;
  customer_id: string;
  name: string;
  visit_title: string;
  price_cents: number; // charged per visit
  interval_months: number;
  next_visit: string; // YYYY-MM-DD
  status: "active" | "paused" | "canceled";
  notes: string;
}

export type Role = "Owner" | "Manager" | "Technician" | "Office" | "Sales";
export interface TeamMember {
  id: string;
  name: string;
  role: Role;
  phone: string;
  email: string;
  hourly_cents: number; // labor cost per hour
  commission_pct: number;
  color: string;
  active: boolean;
  calendar_token?: string; // private link for this person's phone calendar feed
}

export interface TimeEntry {
  id: string;
  member_id: string;
  job_id: string | null;
  start_at: string;
  end_at: string | null; // null = still clocked in
  note: string;
  overtime_minutes?: number; // part of this entry paid as overtime (1.5x)
  edits?: TimeEdit[]; // who changed this entry and what changed
}
export interface TimeEdit { by: string; at: string; added?: boolean; changes: string[] }

export type POStatus = "draft" | "ordered" | "received" | "canceled";
export interface PurchaseOrder {
  id: string;
  number: number;
  vendor: string;
  job_id: string | null;
  status: POStatus;
  items: LineItem[]; // unit_cents = your cost
  ordered_at: string;
  expected_at: string | null;
  notes: string;
}

export type TemplateKind = "estimate" | "job";
export interface DocTemplate {
  id: string;
  kind: TemplateKind; // estimate templates also work for invoices
  name: string;
  trade: string;
  title: string; // default estimate/job title
  notes: string; // estimate notes or job notes
  items: LineItem[]; // estimate templates only
  hours: number; // job templates only: default duration
}

export interface Collections {
  doc_templates: DocTemplate;
  price_items: PriceItem;
  estimates: Estimate;
  leads: Lead;
  service_plans: ServicePlan;
  team_members: TeamMember;
  time_entries: TimeEntry;
  purchase_orders: PurchaseOrder;
}
export type CollectionName = keyof Collections;

/** How invoices and estimates look. Every field is optional; defaults are in lib/docSettings.ts. */
export interface DocSettings {
  accent?: string; // hex color of the header band
  header?: "band" | "plain";
  show_logo?: boolean;
  show_address?: boolean;
  show_service?: boolean;
  show_phone?: boolean;
  show_email?: boolean;
  show_status?: boolean;
  title_invoice?: string; // e.g. "INVOICE" or "TAX INVOICE"
  title_estimate?: string;
  default_notes?: string; // printed on every invoice unless the invoice has its own
  default_estimate_notes?: string;
  portal_items?: boolean; // show line items on invoices in the customer portal (default on)
  logo_pos?: "left" | "center" | "right"; // where the logo sits in the header
  company_align?: "left" | "center" | "right"; // where the company name and details sit
  logo_size?: "small" | "medium" | "large";
  footer?: string; // extra line above the contact footer
  custom_html?: string; // an uploaded HTML template used for printing invoices and estimates
}

export interface LeadFormSettings {
  heading?: string;
  intro?: string;
  button?: string;
  thanks?: string;
  accent?: string;
  show_address?: boolean;
  show_service?: boolean;
  show_email?: boolean;
  services?: string[]; // when set, the "service" field becomes a dropdown
  require_phone?: boolean;
  extra_label?: string; // optional extra question
  custom_html?: string; // an uploaded HTML form that replaces the built-in one
}

export interface Subscription {
  status: "none" | "active" | "past_due" | "canceled" | "incomplete";
  plan: string;
  amount_cents: number;
  billing_interval: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  comped: boolean;
  trialing?: boolean; // still in the 14-day free trial
}

export interface Invite {
  id: string;
  team_member_id: string | null;
  email: string;
  role: string;
  code: string;
  status: "pending" | "accepted" | "revoked";
  created_at: string;
}
