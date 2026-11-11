// Brings a business's existing QuickBooks data into the app: customers, invoices from the last 12 months, and their payments.
// Nothing is changed in QuickBooks. Things that came from the app (or were imported before) are skipped, so it is safe to run again.
import { accountOwner, admin, assertBilling, handler, HttpError, json, requireUser } from "../_shared/util.ts";
import { assertFeature } from "../_shared/plan.ts";
import { getConnection, qboQuery } from "../_shared/qbo.ts";

type Conn = { realm: string; token: string };
// deno-lint-ignore no-explicit-any
async function all(conn: Conn, entity: string, where = ""): Promise<any[]> {
  const out: any[] = [];
  for (let start = 1; start < 5000; start += 500) {
    const r = await qboQuery(conn, `select * from ${entity} ${where} startposition ${start} maxresults 500`);
    const rows = r?.[entity] ?? [];
    out.push(...rows);
    if (rows.length < 500) break;
  }
  return out;
}
const cents = (n: unknown) => Math.round(Number(n ?? 0) * 100);
const noon = (d: string) => `${d.slice(0, 10)}T12:00:00Z`;

handler(async (req) => {
  const user = await requireUser(req);
  const owner = await accountOwner(user.id);
  await assertBilling(owner);
  if (owner !== user.id) throw new HttpError(403, "Only the owner can import from QuickBooks");
  await assertFeature(owner, "qbo");
  const db = admin();
  const conn = await getConnection(owner);
  const since = new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10);
  const counts = { customers: 0, invoices: 0, payments: 0 };

  /* Customers */
  const { data: mine } = await db.from("customers").select("id,name,qbo_id").eq("owner_id", owner);
  const byQbo = new Map((mine ?? []).filter((c) => c.qbo_id).map((c) => [c.qbo_id as string, c.id as string]));
  const byName = new Map((mine ?? []).map((c) => [String(c.name).trim().toLowerCase(), c]));
  for (const c of await all(conn, "Customer", "where Active = true")) {
    if (byQbo.has(c.Id)) continue;
    const name = String(c.DisplayName ?? "").trim();
    if (!name) continue;
    const same = byName.get(name.toLowerCase());
    if (same) { await db.from("customers").update({ qbo_id: c.Id }).eq("id", same.id); byQbo.set(c.Id, same.id as string); continue; }
    const a = c.BillAddr ?? {};
    const address = [a.Line1, [a.City, a.CountrySubDivisionCode, a.PostalCode].filter(Boolean).join(" ")].filter(Boolean).join(", ");
    const { data: row } = await db.from("customers").insert({ owner_id: owner, name, phone: c.PrimaryPhone?.FreeFormNumber ?? "", email: c.PrimaryEmailAddr?.Address ?? "", address, notes: "", qbo_id: c.Id }).select("id").single();
    if (row) { byQbo.set(c.Id, row.id as string); counts.customers++; }
  }

  /* Invoices */
  const { data: haveInv } = await db.from("invoices").select("id,number,qbo_id").eq("owner_id", owner);
  const invByQbo = new Map((haveInv ?? []).filter((i) => i.qbo_id).map((i) => [i.qbo_id as string, i.id as string]));
  const used = new Set((haveInv ?? []).map((i) => i.number as number));
  let maxNo = Math.max(1000, ...used);
  for (const inv of await all(conn, "Invoice", `where TxnDate >= '${since}'`)) {
    if (invByQbo.has(inv.Id)) continue;
    const custId = byQbo.get(inv.CustomerRef?.value);
    if (!custId || cents(inv.TotalAmt) <= 0) continue;
    // deno-lint-ignore no-explicit-any
    const lines = (inv.Line ?? []) as any[];
    const items = lines.flatMap((l) => {
      if (l.DetailType === "SalesItemLineDetail") {
        const d = l.SalesItemLineDetail ?? {};
        const qty = Number(d.Qty ?? 1) || 1;
        const unit = d.UnitPrice != null ? cents(d.UnitPrice) : Math.round(cents(l.Amount) / qty);
        return [{ description: String(l.Description ?? d.ItemRef?.name ?? "Service"), qty, unit_cents: unit }];
      }
      if (l.DetailType === "DiscountLineDetail") return [{ description: "Discount", qty: 1, unit_cents: -cents(l.Amount) }];
      return [];
    });
    const tax = cents(inv.TxnTaxDetail?.TotalTax);
    if (tax > 0) items.push({ description: "Sales tax", qty: 1, unit_cents: tax });
    if (!items.length) continue;
    let number = /^\d{1,9}$/.test(String(inv.DocNumber ?? "")) ? Number(inv.DocNumber) : 0;
    if (!number || used.has(number)) number = ++maxNo; else maxNo = Math.max(maxNo, number);
    used.add(number);
    const paid = cents(inv.Balance) === 0;
    const { data: row, error } = await db.from("invoices").insert({
      owner_id: owner, number, customer_id: custId, status: paid ? "paid" : "sent", items, tax_rate: 0,
      issued_at: noon(inv.TxnDate), due_at: noon(inv.DueDate ?? inv.TxnDate), qbo_id: inv.Id, qbo_hash: "imported",
    }).select("id").single();
    if (error || !row) { console.error("invoice import", error); continue; }
    invByQbo.set(inv.Id, row.id as string);
    counts.invoices++;
  }

  /* Payments that were applied to an invoice we now have */
  const { data: havePay } = await db.from("payments").select("qbo_id").eq("owner_id", owner).not("qbo_id", "is", null);
  const seen = new Set((havePay ?? []).map((p) => p.qbo_id as string));
  const methods = new Map<string, string>();
  for (const m of await all(conn, "PaymentMethod")) {
    const n = String(m.Name ?? "").toLowerCase();
    methods.set(m.Id, n.includes("check") ? "check" : n.includes("cash") ? "cash" : /card|visa|master|amex|discover/.test(n) ? "card" : "other");
  }
  for (const p of await all(conn, "Payment", `where TxnDate >= '${since}'`)) {
    // deno-lint-ignore no-explicit-any
    const lines = (p.Line ?? []) as any[];
    let n = 0;
    for (const l of lines) {
      for (const t of l.LinkedTxn ?? []) {
        if (t.TxnType !== "Invoice") continue;
        const invoiceId = invByQbo.get(t.TxnId);
        const amount = cents(l.Amount);
        if (!invoiceId || amount <= 0) continue;
        const key = n === 0 ? String(p.Id) : `${p.Id}:${n}`;
        n++;
        if (seen.has(key) || seen.has(String(p.Id))) continue;
        const { error } = await db.from("payments").insert({ owner_id: owner, invoice_id: invoiceId, amount_cents: amount, method: methods.get(p.PaymentMethodRef?.value) ?? "other", paid_at: noon(p.TxnDate), qbo_id: key });
        if (!error) { seen.add(key); counts.payments++; } else console.error("payment import", error);
      }
    }
  }

  await db.from("business").update({ qbo_imported_at: new Date().toISOString() }).eq("owner_id", owner);
  return json(counts);
});
