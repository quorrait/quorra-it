// Keeps one invoice in step with QuickBooks Online: creates it, updates it after edits, voids it, or deletes it. Safe to call repeatedly.
// Body: { invoice_id, action?: "sync" | "void" | "delete", hash?: string }  (hash = the app's fingerprint of the invoice contents)
import { admin, handler, HttpError, json, requireUser, type LineItem, accountOwner } from "../_shared/util.ts";
import { getConnection, q, qbo, qboQuery } from "../_shared/qbo.ts";

const dateOnly = (iso: string) => iso.slice(0, 10);

type Conn = { realm: string; token: string };
const cleanName = (n: string) => n.replace(/[:\t\r\n"]/g, " ").replace(/\s+/g, " ").trim().slice(0, 100);

/** One QuickBooks Service item per service name, created on first use. Falls back to a generic "Services" item. */
async function itemIds(conn: Conn, names: string[]) {
  const out = new Map<string, string>();
  let generic = (await qboQuery(conn, `select Id from Item where Name = 'Services' maxresults 1`))?.Item?.[0]?.Id as string | undefined;
  if (!generic) generic = (await qboQuery(conn, `select Id from Item where Type = 'Service' maxresults 1`))?.Item?.[0]?.Id;
  let income: string | undefined;
  for (const raw of new Set(names)) {
    const name = cleanName(raw) || "Service";
    try {
      const found = (await qboQuery(conn, `select Id from Item where Name = '${q(name)}' maxresults 1`))?.Item?.[0]?.Id as string | undefined;
      if (found) { out.set(raw, found); continue; }
      if (!income) income = (await qboQuery(conn, `select Id from Account where AccountType = 'Income' maxresults 1`))?.Account?.[0]?.Id;
      if (!income) throw new Error("no income account");
      const made = await qbo(conn, "POST", "item", { Name: name, Type: "Service", IncomeAccountRef: { value: income } });
      out.set(raw, made.Item.Id);
    } catch { if (generic) out.set(raw, generic); }
  }
  if (!generic && out.size === 0) throw new HttpError(400, "Add a Service item in QuickBooks (Sales > Products and services), then try again");
  return { out, generic: generic ?? [...out.values()][0] };
}

async function buildLines(conn: Conn, inv: any) {
  const items = inv.items as LineItem[];
  const { out, generic } = await itemIds(conn, items.map((li) => li.description || "Service"));
  const lines: unknown[] = items.map((li) => ({
    DetailType: "SalesItemLineDetail",
    Amount: Math.round(li.qty * li.unit_cents) / 100,
    Description: li.description,
    SalesItemLineDetail: { ItemRef: { value: out.get(li.description || "Service") ?? generic }, Qty: li.qty, UnitPrice: li.unit_cents / 100 },
  }));
  const subtotal = items.reduce((s, li) => s + Math.round(li.qty * li.unit_cents), 0);
  const tax = Math.round((subtotal * Number(inv.tax_rate)) / 100);
  // Tax goes in as its own line so QuickBooks' total always matches the invoice the customer saw.
  if (tax > 0) lines.push({ DetailType: "SalesItemLineDetail", Amount: tax / 100, Description: `Sales tax (${inv.tax_rate}%)`, SalesItemLineDetail: { ItemRef: { value: generic }, Qty: 1, UnitPrice: tax / 100 } });
  return lines;
}

handler(async (req) => {
  const user = await requireUser(req);
  const ownerId = await accountOwner(user.id);
  const { invoice_id, action = "sync", hash = null } = await req.json();
  const db = admin();

  const { data: inv } = await db.from("invoices").select("*").eq("id", invoice_id).eq("owner_id", ownerId).maybeSingle();

  /* Delete or void: only matters if the invoice ever reached QuickBooks. */
  if (action === "delete" || action === "void") {
    if (!inv?.qbo_id) return json({ ok: true, skipped: true });
    const conn = await getConnection(ownerId);
    const cur = (await qbo(conn, "GET", `invoice/${inv.qbo_id}`)).Invoice;
    if (action === "delete") {
      // Payments must come off first, otherwise QuickBooks refuses to delete the invoice.
      const { data: pays } = await db.from("payments").select("qbo_id").eq("invoice_id", inv.id).not("qbo_id", "is", null);
      for (const p of pays ?? []) {
        try { const pay = (await qbo(conn, "GET", `payment/${p.qbo_id}`)).Payment; await qbo(conn, "POST", "payment?operation=delete", { Id: pay.Id, SyncToken: pay.SyncToken }); } catch { /* already gone */ }
      }
      const fresh = (await qbo(conn, "GET", `invoice/${inv.qbo_id}`)).Invoice;
      await qbo(conn, "POST", "invoice?operation=delete", { Id: fresh.Id, SyncToken: fresh.SyncToken });
      return json({ ok: true });
    }
    await qbo(conn, "POST", "invoice?operation=void", { Id: cur.Id, SyncToken: cur.SyncToken });
    await db.from("invoices").update({ qbo_hash: "void" }).eq("id", inv.id);
    return json({ ok: true });
  }

  if (!inv) throw new HttpError(404, "Invoice not found");
  if (inv.status === "draft" || inv.status === "void") throw new HttpError(400, "Only sent or paid invoices can be synced");

  const { data: cust } = await db.from("customers").select("*").eq("id", inv.customer_id).eq("owner_id", ownerId).maybeSingle();
  if (!cust) throw new HttpError(404, "Customer not found");

  const conn = await getConnection(ownerId);

  /* 1. Customer: reuse by id, then by name, else create. */
  let custId: string | null = cust.qbo_id;
  if (!custId) {
    const found = await qboQuery(conn, `select Id from Customer where DisplayName = '${q(cust.name)}'`);
    custId = found?.Customer?.[0]?.Id ?? null;
  }
  if (!custId) {
    const created = await qbo(conn, "POST", "customer", {
      DisplayName: cust.name,
      PrimaryEmailAddr: cust.email ? { Address: cust.email } : undefined,
      PrimaryPhone: cust.phone ? { FreeFormNumber: cust.phone } : undefined,
      BillAddr: cust.address ? { Line1: cust.address } : undefined,
    });
    custId = created.Customer.Id;
  }
  if (custId !== cust.qbo_id) await db.from("customers").update({ qbo_id: custId }).eq("id", cust.id);

  /* 2. Invoice: create it once, then update it whenever its contents change. */
  let qboInvoiceId: string | null = inv.qbo_id;
  if (!qboInvoiceId) {
    const created = await qbo(conn, "POST", "invoice", {
      CustomerRef: { value: custId },
      DocNumber: String(inv.number),
      TxnDate: dateOnly(inv.issued_at),
      DueDate: dateOnly(inv.due_at),
      Line: await buildLines(conn, inv),
    });
    qboInvoiceId = created.Invoice.Id as string;
    await db.from("invoices").update({ qbo_id: qboInvoiceId, qbo_hash: hash }).eq("id", inv.id);
  } else if (hash && hash !== inv.qbo_hash) {
    const cur = (await qbo(conn, "GET", `invoice/${qboInvoiceId}`)).Invoice;
    await qbo(conn, "POST", "invoice", {
      Id: cur.Id, SyncToken: cur.SyncToken, sparse: true,
      CustomerRef: { value: custId },
      DocNumber: String(inv.number),
      TxnDate: dateOnly(inv.issued_at),
      DueDate: dateOnly(inv.due_at),
      Line: await buildLines(conn, inv),
    });
    await db.from("invoices").update({ qbo_hash: hash }).eq("id", inv.id);
  }

  /* 3. Payments not yet sent. */
  const { data: pays } = await db.from("payments").select("*").eq("invoice_id", inv.id).is("qbo_id", null);
  for (const p of pays ?? []) {
    const created = await qbo(conn, "POST", "payment", {
      CustomerRef: { value: custId },
      TotalAmt: p.amount_cents / 100,
      TxnDate: dateOnly(p.paid_at),
      PrivateNote: `${p.method} payment via app`,
      Line: [{ Amount: p.amount_cents / 100, LinkedTxn: [{ TxnId: qboInvoiceId, TxnType: "Invoice" }] }],
    });
    await db.from("payments").update({ qbo_id: created.Payment.Id }).eq("id", p.id);
  }

  return json({ qbo_id: qboInvoiceId });
});
