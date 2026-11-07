// Public: a customer's portal. Returns their quotes and invoices by the customer's unguessable link token. Deploy with --no-verify-jwt.
import { admin, handler, HttpError, invoiceTotalCents, json, type LineItem } from "../_shared/util.ts";

handler(async (req) => {
  const t = new URL(req.url).searchParams.get("t") ?? "";
  if (t.length < 16) throw new HttpError(400, "Invalid link");
  const db = admin();
  const { data: cust } = await db.from("customers").select("id,owner_id,name").eq("portal_token", t).maybeSingle();
  if (!cust) throw new HttpError(404, "This link is not valid");
  const [{ data: biz }, { data: ests }, { data: invs }] = await Promise.all([
    db.from("business").select("name,phone,email,logo,stripe_connected").eq("owner_id", cust.owner_id).maybeSingle(),
    db.from("estimates").select("number,title,status,items,tax_rate,valid_until,public_token").eq("customer_id", cust.id).neq("status", "draft").order("created_at", { ascending: false }),
    db.from("invoices").select("id,number,status,items,tax_rate,issued_at,due_at").eq("customer_id", cust.id).neq("status", "draft").order("issued_at", { ascending: false }),
  ]);
  const ids = (invs ?? []).map((i) => i.id);
  const { data: pays } = ids.length ? await db.from("payments").select("invoice_id,amount_cents,paid_at,method").in("invoice_id", ids).order("paid_at", { ascending: true }) : { data: [] as { invoice_id: string; amount_cents: number; paid_at: string; method: string }[] };
  const paidBy = new Map<string, number>();
  const payList = new Map<string, { amount_cents: number; date: string; method: string }[]>();
  for (const p of pays ?? []) {
    paidBy.set(p.invoice_id, (paidBy.get(p.invoice_id) ?? 0) + p.amount_cents);
    payList.set(p.invoice_id, [...(payList.get(p.invoice_id) ?? []), { amount_cents: p.amount_cents, date: p.paid_at, method: p.method }]);
  }
  return json({
    customer: cust.name,
    business: biz ?? { name: "" },
    can_pay: Boolean(biz?.stripe_connected),
    quotes: (ests ?? []).map((e) => ({ number: e.number, title: e.title, status: e.status, valid_until: e.valid_until, token: e.public_token, total_cents: invoiceTotalCents(e.items as LineItem[], Number(e.tax_rate)) })),
    invoices: (invs ?? []).map((i) => {
      const total = invoiceTotalCents(i.items as LineItem[], Number(i.tax_rate));
      const paid = paidBy.get(i.id) ?? 0;
      return { id: i.id, number: i.number, status: i.status, issued_at: i.issued_at, due_at: i.due_at, total_cents: total, paid_cents: paid, balance_cents: Math.max(0, total - paid), payments: payList.get(i.id) ?? [] };
    }),
  });
});
