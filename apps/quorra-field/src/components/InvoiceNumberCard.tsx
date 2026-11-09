import { useState } from "react";
import { useData } from "../lib/app";
import { Field, useToast } from "./ui";
import { errMsg } from "../lib/errors";

/** Lets the business choose where invoice numbers start, for example to match numbers they already used. */
export default function InvoiceNumberCard() {
  const { business, invoices, store, refresh } = useData();
  const toast = useToast();
  const auto = Math.max(1000, ...invoices.map((i) => i.number)) + 1;
  const [v, setV] = useState(String(business.invoice_next ?? ""));
  const [busy, setBusy] = useState(false);
  const next = Math.max(Number(v) || 0, auto);
  async function save() {
    setBusy(true);
    try { await store.saveBusiness({ invoice_next: v ? Math.floor(Number(v)) : null }); await refresh(); toast(v ? `Next invoice will be #${next}` : "Numbering is automatic"); }
    catch (e) { toast(errMsg(e, "Could not save. Run the latest database update first.")); } finally { setBusy(false); }
  }
  return (
    <details className="card fold">
      <summary><span className="card-title">Invoice numbering</span><span className="small muted">Where numbers start</span></summary>
      <div className="stack">
      <div className="small muted">New invoices count up from the highest number you have. To start higher, for example to continue from your old system or QuickBooks, enter the number you want next. You can also change the number on any invoice when you edit it.</div>
      <Field label="Start the next invoice at"><input className="input" inputMode="numeric" placeholder={`Automatic (#${auto})`} value={v} onChange={(e) => setV(e.target.value.replace(/\D/g, ""))} /></Field>
      <button className="btn primary block" disabled={busy} onClick={() => void save()}>Save</button>
      </div>
    </details>
  );
}
