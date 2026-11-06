// Public: returns one quote by its unguessable link token so the customer can read it. Deploy with --no-verify-jwt.
import { admin, handler, HttpError, invoiceTotalCents, json, type LineItem } from "../_shared/util.ts";

handler(async (req) => {
  const t = new URL(req.url).searchParams.get("t") ?? "";
  if (t.length < 16) throw new HttpError(400, "Invalid link");
  const db = admin();
  const { data: est } = await db.from("estimates").select("*").eq("public_token", t).maybeSingle();
  if (!est) throw new HttpError(404, "This quote link is not valid");
  const [{ data: biz }, { data: cust }, { data: job }] = await Promise.all([
    db.from("business").select("name,phone,email,logo").eq("owner_id", est.owner_id).maybeSingle(),
    db.from("customers").select("name").eq("id", est.customer_id).maybeSingle(),
    est.job_id ? db.from("jobs").select("start_at").eq("id", est.job_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const items = est.items as LineItem[];
  const subtotal = items.reduce((s, li) => s + Math.round(li.qty * li.unit_cents), 0);
  return json({
    number: est.number, title: est.title, status: est.status, notes: est.notes, valid_until: est.valid_until,
    items, tax_rate: est.tax_rate, subtotal_cents: subtotal, total_cents: invoiceTotalCents(items, est.tax_rate),
    customer: cust?.name ?? "", business: biz ?? { name: "" }, scheduled_for: job?.start_at ?? null,
  });
});
