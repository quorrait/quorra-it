import { errMsg } from "../lib/errors";
import { useState } from "react";
import { Field, Sheet, useToast } from "./ui";
import { useData } from "../lib/app";
import type { Estimate, Invoice, LineItem } from "../lib/types";
import { addDays, fromDateInput, toDateInput } from "../lib/dates";
import { invoiceTotals, money } from "../lib/money";
import TemplatePicker from "./TemplatePicker";
import { LineItemsEditor, type Row, rowsToItems, toRow } from "./LineItems";

export default function InvoiceForm({ invoice, jobId, customerId, estimateId, onClose, onSaved }: {
  invoice?: Invoice;
  jobId?: string;
  customerId?: string;
  estimateId?: string; // start from this estimate
  onClose(): void;
  onSaved?(i: Invoice): void;
}) {
  const { store, customers, jobs, invoices, estimates, business, refresh } = useData();
  const toast = useToast();
  const job = jobs.find((j) => j.id === (invoice?.job_id ?? jobId));

  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [cust, setCust] = useState(invoice?.customer_id ?? customerId ?? estimates.find((e) => e.id === estimateId)?.customer_id ?? job?.customer_id ?? customers[0]?.id ?? "");
  // New invoices start from the customer's latest accepted estimate (or the one tied to this job).
  const estsFor = (cid: string) => invoice ? [] : estimates
    .filter((e) => e.id === estimateId || (e.status === "approved" || e.status === "sent") && !e.invoice_id && ((job && e.job_id === job.id) || e.customer_id === cid))
    .sort((a, b) => Number(job && b.job_id === job.id) - Number(job && a.job_id === job.id) || b.number - a.number);
  const estFor = (cid: string) => estsFor(cid)[0];
  const picked = estimateId ? estimates.find((e) => e.id === estimateId) : undefined;
  const est0 = picked ?? estFor(invoice?.customer_id ?? customerId ?? job?.customer_id ?? customers[0]?.id ?? "");
  const fill = (e: typeof est0) => e ? e.items.map((li) => {
    const r = toRow(li);
    // A bare description like "Replacement" gets the estimate title so the invoice says what it was for.
    if (e.title && r.description.trim().split(/\s+/).length <= 2 && !r.description.toLowerCase().includes(e.title.toLowerCase())) r.description = `${r.description.trim()} - ${e.title}`.replace(/^ - /, "");
    return r;
  }) : [];
  const [fromEst, setFromEst] = useState<Estimate | undefined>(est0);
  const [touched, setTouched] = useState(false);
  const [rows, setRows] = useState<Row[]>(
    invoice ? invoice.items.map(toRow) : est0 ? fill(est0) : [{ description: job?.title ?? "", qty: "1", price: "" }],
  );
  const [taxRate, setTaxRate] = useState(String(invoice?.tax_rate ?? est0?.tax_rate ?? business.tax_rate ?? 0));
  const [due, setDue] = useState(toDateInput(invoice?.due_at ?? addDays(new Date(), 14).toISOString()));
  const [issued, setIssued] = useState(toDateInput(invoice?.issued_at ?? new Date().toISOString()));
  const [notes, setNotes] = useState(invoice?.notes ?? (est0 ? `For estimate #${est0.number}: ${est0.title}` : ""));
  const [busy, setBusy] = useState(false);

  const items: LineItem[] = rowsToItems(rows);
  const totals = invoiceTotals({ items, tax_rate: parseFloat(taxRate) || 0 });

  async function save() {
    if (!cust) return toast("Pick a customer");
    if (cust === "__new__" && !newName.trim()) return toast("Add the customer's name");
    if (items.length === 0) return toast("Add at least one line item");
    setBusy(true);
    try {
      let cid = cust;
      if (cid === "__new__") cid = (await store.saveCustomer({ name: newName.trim(), phone: newPhone.trim(), email: "", address: job?.address ?? "", notes: "" })).id;
      const nextNumber = Math.max(1000, ...invoices.map((i) => i.number)) + 1;
      const build = (n: number) => ({
        id: invoice?.id,
        number: invoice?.number ?? n,
        customer_id: cid,
        job_id: invoice?.job_id ?? job?.id ?? fromEst?.job_id ?? null,
        status: invoice?.status ?? "draft",
        items,
        tax_rate: parseFloat(taxRate) || 0,
        issued_at: fromDateInput(issued),
        notes,
        due_at: fromDateInput(due),
        qbo_id: invoice?.qbo_id ?? null,
      });
      let saved;
      try {
        saved = await store.saveInvoice(build(nextNumber));
      } catch (err) {
        // Another device may have taken this number meanwhile: look again and use the next free one.
        if (invoice || (err as { code?: string })?.code !== "23505") throw err;
        const fresh = await store.listInvoices();
        saved = await store.saveInvoice(build(Math.max(1000, ...fresh.map((i) => i.number)) + 1));
      }
      if (fromEst && !invoice) await store.saveRow("estimates", { ...fromEst, invoice_id: saved.id });
      await refresh();
      toast(invoice ? "Invoice updated" : "Invoice created");
      onSaved?.(saved);
      onClose();
    } catch (e) {
      toast(errMsg(e, "Could not save"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet title={invoice ? `Edit invoice #${invoice.number}` : "New invoice"} onClose={onClose}>
      <div className="stack">
        <Field label="Customer">
          <select className="select" value={cust} onChange={(e) => {
            setCust(e.target.value);
            if (!touched && !invoice) { const e2 = estFor(e.target.value); setFromEst(e2); if (e2) { setRows(fill(e2)); setTaxRate(String(e2.tax_rate)); } }
          }}>
            <option value="__new__">+ New customer</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        {cust === "__new__" && (
          <div className="grid2 stack-sm">
            <Field label="Customer name"><input className="input" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Jane Smith" /></Field>
            <Field label="Phone"><input className="input" type="tel" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="(916) 555-0100" /></Field>
          </div>
        )}

        {estsFor(cust).length > 0 && (
          <Field label="Start from estimate">
            <select className="select" value={fromEst?.id ?? ""} onChange={(e) => {
              const x = estimates.find((q) => q.id === e.target.value); setFromEst(x); setTouched(true);
              if (x) { setRows(fill(x)); setTaxRate(String(x.tax_rate)); setNotes(`For estimate #${x.number}: ${x.title}`); }
            }}>
              <option value="">None (blank invoice)</option>
              {estsFor(cust).map((x) => <option key={x.id} value={x.id}>#{x.number} · {x.title} · {money(invoiceTotals({ items: x.items, tax_rate: x.tax_rate }).total)}</option>)}
            </select>
          </Field>
        )}
        {!invoice && <TemplatePicker kind="estimate" onPick={(t) => { setTouched(true); setFromEst(undefined); setRows(t.items.map(toRow)); }} />}
        <LineItemsEditor rows={rows} setRows={(r) => { setTouched(true); setRows(r); }} />

        <div className="grid2 stack-sm">
          <Field label="Tax rate %"><input className="input" inputMode="decimal" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} /></Field>
          <Field label="Invoice date"><input className="input" type="date" value={issued} onChange={(e) => setIssued(e.target.value)} /></Field>
        </div>
        <Field label="Payment due">
          <input className="input" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          <div className="chips" style={{ marginTop: 8 }}>
            {([["On receipt", 0], ["Net 7", 7], ["Net 14", 14], ["Net 30", 30]] as [string, number][]).map(([l, n]) => (
              <button key={l} type="button" className="chip" onClick={() => setDue(toDateInput(addDays(new Date(fromDateInput(issued)), n).toISOString()))}>{l}</button>
            ))}
          </div>
        </Field>
        <Field label="Notes and payment terms (printed on the invoice)">
          <textarea className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Payment methods accepted, warranty, late fee policy" />
        </Field>

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
