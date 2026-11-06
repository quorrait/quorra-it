// Pushes one invoice (and its customer + any new payments) to QuickBooks Online. Safe to call repeatedly.
import { admin, handler, HttpError, json, requireUser, type LineItem } from "../_shared/util.ts";
import { getConnection, q, qbo, qboQuery } from "../_shared/qbo.ts";

const dateOnly = (iso: string) => iso.slice(0, 10);

handler(async (req) => {
  const user = await requireUser(req);
  const { invoice_id } = await req.json();
  const db = admin();

  const { data: inv } = await db.from("invoices").select("*").eq("id", invoice_id).eq("owner_id", user.id).maybeSingle();
  if (!inv) throw new HttpError(404, "Invoice not found");
  if (inv.status === "draft" || inv.status === "void") throw new HttpError(400, "Only sent or paid invoices can be synced");

  const { data: cust } = await db.from("customers").select("*").eq("id", inv.customer_id).eq("owner_id", user.id).maybeSingle();
  if (!cust) throw new HttpError(404, "Customer not found");

  const conn = await getConnection(user.id);

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

  /* 2. Invoice (only once). */
  let qboInvoiceId: string | null = inv.qbo_id;
  if (!qboInvoiceId) {
    // QuickBooks needs an Item for each sales line. Prefer one named "Services", else any Service item.
    let item = (await qboQuery(conn, `select Id from Item where Name = 'Services' maxresults 1`))?.Item?.[0];
    if (!item) item = (await qboQuery(conn, `select Id from Item where Type = 'Service' maxresults 1`))?.Item?.[0];
    if (!item) throw new HttpError(400, "Add a Service item in QuickBooks (Sales > Products and services), then try again");

    const items = inv.items as LineItem[];
    const lines: unknown[] = items.map((li) => ({
      DetailType: "SalesItemLineDetail",
      Amount: Math.round(li.qty * li.unit_cents) / 100,
      Description: li.description,
      SalesItemLineDetail: { ItemRef: { value: item.Id }, Qty: li.qty, UnitPrice: li.unit_cents / 100 },
    }));
    const subtotal = items.reduce((s, li) => s + Math.round(li.qty * li.unit_cents), 0);
    const tax = Math.round((subtotal * Number(inv.tax_rate)) / 100);
    // Tax goes in as its own line so QuickBooks' total always matches the invoice the customer saw.
    if (tax > 0) {
      lines.push({
        DetailType: "SalesItemLineDetail",
        Amount: tax / 100,
        Description: `Sales tax (${inv.tax_rate}%)`,
        SalesItemLineDetail: { ItemRef: { value: item.Id }, Qty: 1, UnitPrice: tax / 100 },
      });
    }

    const created = await qbo(conn, "POST", "invoice", {
      CustomerRef: { value: custId },
      DocNumber: String(inv.number),
      TxnDate: dateOnly(inv.issued_at),
      DueDate: dateOnly(inv.due_at),
      Line: lines,
    });
    qboInvoiceId = created.Invoice.Id as string;
    await db.from("invoices").update({ qbo_id: qboInvoiceId }).eq("id", inv.id);
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
