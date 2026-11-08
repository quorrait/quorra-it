// Public: returns one quote by its unguessable link token so the customer can read it. Deploy with --no-verify-jwt.
import { availableSlots } from "../_shared/schedule.ts";
import { admin, handler, HttpError, invoiceTotalCents, json, type LineItem } from "../_shared/util.ts";

handler(async (req) => {
  const t = new URL(req.url).searchParams.get("t") ?? "";
  if (t.length < 16) throw new HttpError(400, "Invalid link");
  const db = admin();
  const { data: est } = await db.from("estimates").select("*").eq("public_token", t).maybeSingle();
  if (!est) throw new HttpError(404, "This quote link is not valid");
  const [{ data: biz }, { data: cust }, { data: job }] = await Promise.all([
    db.from("business").select("name,phone,email,logo,hours").eq("owner_id", est.owner_id).maybeSingle(),
    db.from("customers").select("name").eq("id", est.customer_id).maybeSingle(),
    est.job_id ? db.from("jobs").select("id,start_at,end_at,status").eq("id", est.job_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const wantSlots = new URL(req.url).searchParams.get("slots") === "1" && est.status === "approved";
  const sched = wantSlots ? await availableSlots(db, est.owner_id, (biz as { hours?: never } | null)?.hours, job?.id, est.duration_min) : null;
  const items = est.items as LineItem[];
  const subtotal = items.reduce((s, li) => s + Math.round(li.qty * li.unit_cents), 0);
  return json({
    number: est.number, title: est.title, status: est.status, notes: est.notes, valid_until: est.valid_until,
    items, tax_rate: est.tax_rate, subtotal_cents: subtotal, total_cents: invoiceTotalCents(items, est.tax_rate),
    customer: cust?.name ?? "", business: biz ? { name: biz.name, phone: biz.phone, email: biz.email, logo: biz.logo } : { name: "" }, scheduled_for: job?.start_at ?? null, scheduled_end: job?.end_at ?? null,
    job_status: job?.status ?? null, slots: sched?.slots, job_minutes: sched?.job_minutes,
  });
});
