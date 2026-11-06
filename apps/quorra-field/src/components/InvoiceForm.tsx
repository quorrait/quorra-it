import { useState } from "react";
import { Field, Sheet, useToast } from "./ui";
import { useData } from "../lib/app";
import type { Invoice, LineItem } from "../lib/types";
import { addDays, fromDateInput, toDateInput } from "../lib/dates";
import { invoiceTotals, money } from "../lib/money";
import { LineItemsEditor, type Row, rowsToItems, toRow } from "./LineItems";

export default function InvoiceForm({ invoice, jobId, customerId, onClose, onSaved }: {
  invoice?: Invoice;
  jobId?: string;
  customerId?: string;
  onClose(): void;
  onSaved?(i: Invoice): void;
}) {
  const { store, customers, jobs, invoices, business, refresh } = useData();
  const toast = useToast();
  const job = jobs.find((j) => j.id === (invoice?.job_id ?? jobId));

  const [cust, setCust] = useState(invoice?.customer_id ?? customerId ?? job?.customer_id ?? customers[0]?.id ?? "");
  const [rows, setRows] = useState<Row[]>(
    invoice ? invoice.items.map(toRow) : [{ description: job?.title ?? "", qty: "1", price: "" }],
  );
  const [taxRate, setTaxRate] = useState(String(invoice?.tax_rate ?? business.tax_rate ?? 0));
  const [due, setDue] = useState(toDateInput(invoice?.due_at ?? addDays(new Date(), 14).toISOString()));
  const [busy, setBusy] = useState(false);

  const items: LineItem[] = rowsToItems(rows);
  const totals = invoiceTotals({ items, tax_rate: parseFloat(taxRate) || 0 });

  async function save() {
    if (!cust) return toast("Pick a customer");
    if (items.length === 0) return toast("Add at least one line item");
    setBusy(true);
    try {
      const nextNumber = Math.max(1000, ...invoices.map((i) => i.number)) + 1;
      const saved = await store.saveInvoice({
        id: invoice?.id,
        number: invoice?.number ?? nextNumber,
        customer_id: cust,
        job_id: invoice?.job_id ?? job?.id ?? null,
        status: invoice?.status ?? "draft",
        items,
        tax_rate: parseFloat(taxRate) || 0,
        issued_at: invoice?.issued_at ?? new Date().toISOString(),
        due_at: fromDateInput(due),
        qbo_id: invoice?.qbo_id ?? null,
      });
      await refresh();
      toast(invoice ? "Invoice updated" : "Invoice created");
      onSaved?.(saved);
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet title={invoice ? `Edit invoice #${invoice.number}` : "New invoice"} onClose={onClose}>
      <div className="stack">
        {!invoice && (
          <Field label="Customer">
            <select className="select" value={cust} onChange={(e) => setCust(e.target.value)}>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
        )}

        <LineItemsEditor rows={rows} setRows={setRows} />

        <div className="grid2 stack-sm">
          <Field label="Tax rate %"><input className="input" inputMode="decimal" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} /></Field>
          <Field label="Due date"><input className="input" type="date" value={due} onChange={(e) => setDue(e.target.value)} /></Field>
        </div>

        <div className="totals" style={{ marginTop: 0 }}>
          <div className="t muted"><span>Subtotal</span><span className="num">{money(totals.subtotal)}</span></div>
          <div className="t muted"><span>Tax</span><span className="num">{money(totals.tax)}</span></div>
          <div className="t grand"><span>Total</span><span className="num">{money(totals.total)}</span></div>
        </div>

        <button className="btn primary block" onClick={save} disabled={busy}>{busy ? "Saving..." : invoice ? "Save invoice" : "Create invoice"}</button>
      </div>
    </Sheet>
  );
}
