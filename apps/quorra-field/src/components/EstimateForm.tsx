import { FlagBanner, useBlockedGuard } from "./FlagBanner";
import { errMsg } from "../lib/errors";
import { useState } from "react";
import { Field, Sheet, useToast } from "./ui";
import { useData } from "../lib/app";
import type { Estimate } from "../lib/types";
import { addDays, fromDateInput, toDateInput } from "../lib/dates";
import { invoiceTotals, money } from "../lib/money";
import TemplatePicker from "./TemplatePicker";
import PriceGuide from "./PriceGuide";
import { defaultTaxRate } from "../lib/stateTax";
import DurationField from "./DurationField";
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
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [cust, setCust] = useState(estimate?.customer_id ?? customerId ?? customers[0]?.id ?? "");
  const [title, setTitle] = useState(estimate?.title ?? defaultTitle ?? "");
  const [rows, setRows] = useState<Row[]>(estimate ? estimate.items.map(toRow) : [{ description: "", qty: "1", price: "" }]);
  const [taxRate, setTaxRate] = useState(String(estimate?.tax_rate ?? defaultTaxRate(business)));
  const [valid, setValid] = useState(toDateInput(estimate?.valid_until ?? addDays(new Date(), 30).toISOString()));
  const [notes, setNotes] = useState(estimate?.notes ?? "");
  const [hours, setHours] = useState(estimate?.duration_min ? String(+(estimate.duration_min / 60).toFixed(4)) : "");
  const [busy, setBusy] = useState(false);

  const items = rowsToItems(rows);
  const totals = invoiceTotals({ items, tax_rate: parseFloat(taxRate) || 0 });

  const guard = useBlockedGuard();
  async function save() {
    if (!cust) return toast("Pick a customer");
    if (!estimate && !(await guard(customers.find((x) => x.id === cust)))) return;
    if (cust === "__new__" && !newName.trim()) return toast("Add the customer's name");
    if (!title.trim()) return toast("Give the estimate a title");
    if (items.length === 0) return toast("Add at least one line item");
    setBusy(true);
    try {
      let cid = cust;
      if (cid === "__new__") cid = (await store.saveCustomer({ name: newName.trim(), phone: newPhone.trim(), email: "", address: "", notes: "" })).id;
      const saved = await store.saveRow("estimates", {
        id: estimate?.id,
        number: estimate?.number ?? Math.max(2000, ...estimates.map((e) => e.number)) + 1,
        customer_id: cid,
        title: title.trim(),
        status: estimate?.status ?? "draft",
        items,
        tax_rate: parseFloat(taxRate) || 0,
        issued_at: estimate?.issued_at ?? new Date().toISOString(),
        valid_until: fromDateInput(valid),
        notes,
        duration_min: Math.round((parseFloat(hours) || 0) * 60),
        job_id: estimate?.job_id ?? null,
        invoice_id: estimate?.invoice_id ?? null,
      });
      await refresh();
      toast(estimate ? "Estimate updated" : "Estimate created");
      onSaved?.(saved);
      onClose();
    } catch (e) {
      toast(errMsg(e, "Could not save"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet title={estimate ? `Edit estimate #${estimate.number}` : "New estimate"} onClose={onClose}>
      <div className="stack">
        <FlagBanner c={customers.find((x) => x.id === cust)} />
        {!estimate && (
          <Field label="Customer">
            <select className="select" value={cust} onChange={(e) => setCust(e.target.value)}>
              <option value="__new__">+ New customer</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
        )}
        {!estimate && cust === "__new__" && (
          <div className="grid2 stack-sm">
            <Field label="Customer name"><input className="input" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Jane Smith" /></Field>
            <Field label="Phone"><input className="input" type="tel" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="(916) 555-0100" /></Field>
          </div>
        )}
        {!estimate && <TemplatePicker kind="estimate" onPick={(t) => { setTitle(t.title || t.name); setRows(t.items.map(toRow)); setNotes(t.notes); }} />}
        <Field label="Title">
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Replace 3-ton AC condenser" />
        </Field>
        <LineItemsEditor rows={rows} setRows={setRows} />
        <DurationField label="How long will the job take? (used for online booking)" value={hours} onChange={setHours} />
        <PriceGuide title={title} items={items} estimateId={estimate?.id} />
        <div className="grid2 stack-sm">
          <Field label="Tax rate %"><input className="input" inputMode="decimal" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} /></Field>
          <Field label="Valid until"><input className="input" type="date" value={valid} onChange={(e) => setValid(e.target.value)} /></Field>
        </div>
        <Field label="Notes for the customer">
          <textarea className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Scope of work, warranty and payment terms" />
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
