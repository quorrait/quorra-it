import { useState } from "react";
import { Field, Sheet, useToast } from "./ui";
import { useData } from "../lib/app";
import type { Estimate } from "../lib/types";
import { addDays, fromDateInput, toDateInput } from "../lib/dates";
import { invoiceTotals, money } from "../lib/money";
import { LineItemsEditor, type Row, rowsToItems, toRow } from "./LineItems";

export default function EstimateForm({ estimate, customerId, title: defaultTitle, onClose, onSaved }: {
  estimate?: Estimate;
  customerId?: string;
  title?: string;
  onClose(): void;
  onSaved?(e: Estimate): void;
}) {
  const { store, customers, estimates, business, refresh } = useData();
  const toast = useToast();
  const [cust, setCust] = useState(estimate?.customer_id ?? customerId ?? customers[0]?.id ?? "");
  const [title, setTitle] = useState(estimate?.title ?? defaultTitle ?? "");
  const [rows, setRows] = useState<Row[]>(estimate ? estimate.items.map(toRow) : [{ description: "", qty: "1", price: "" }]);
  const [taxRate, setTaxRate] = useState(String(estimate?.tax_rate ?? business.tax_rate ?? 0));
  const [valid, setValid] = useState(toDateInput(estimate?.valid_until ?? addDays(new Date(), 30).toISOString()));
  const [notes, setNotes] = useState(estimate?.notes ?? "");
  const [busy, setBusy] = useState(false);

  const items = rowsToItems(rows);
  const totals = invoiceTotals({ items, tax_rate: parseFloat(taxRate) || 0 });

  async function save() {
    if (!cust) return toast("Pick a customer");
    if (!title.trim()) return toast("Give the estimate a title");
    if (items.length === 0) return toast("Add at least one line item");
    setBusy(true);
    try {
      const saved = await store.saveRow("estimates", {
        id: estimate?.id,
        number: estimate?.number ?? Math.max(2000, ...estimates.map((e) => e.number)) + 1,
        customer_id: cust,
        title: title.trim(),
        status: estimate?.status ?? "draft",
        items,
        tax_rate: parseFloat(taxRate) || 0,
        issued_at: estimate?.issued_at ?? new Date().toISOString(),
        valid_until: fromDateInput(valid),
        notes,
        job_id: estimate?.job_id ?? null,
        invoice_id: estimate?.invoice_id ?? null,
      });
      await refresh();
      toast(estimate ? "Estimate updated" : "Estimate created");
      onSaved?.(saved);
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet title={estimate ? `Edit estimate #${estimate.number}` : "New estimate"} onClose={onClose}>
      <div className="stack">
        {!estimate && (
          <Field label="Customer">
            <select className="select" value={cust} onChange={(e) => setCust(e.target.value)}>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
        )}
        <Field label="Title">
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Replace 3-ton AC condenser" />
        </Field>
        <LineItemsEditor rows={rows} setRows={setRows} />
        <div className="grid2 stack-sm">
          <Field label="Tax rate %"><input className="input" inputMode="decimal" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} /></Field>
          <Field label="Valid until"><input className="input" type="date" value={valid} onChange={(e) => setValid(e.target.value)} /></Field>
        </div>
        <Field label="Notes for the customer">
          <textarea className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Scope, warranty, payment terms..." />
        </Field>
        <div className="totals" style={{ marginTop: 0 }}>
          <div className="t muted"><span>Subtotal</span><span className="num">{money(totals.subtotal)}</span></div>
          <div className="t muted"><span>Tax</span><span className="num">{money(totals.tax)}</span></div>
          <div className="t grand"><span>Total</span><span className="num">{money(totals.total)}</span></div>
        </div>
        <button className="btn primary block" onClick={save} disabled={busy}>{busy ? "Saving..." : estimate ? "Save estimate" : "Create estimate"}</button>
      </div>
    </Sheet>
  );
}
