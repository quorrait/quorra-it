import { useState } from "react";
import { useData } from "../lib/app";
import { Field, Sheet, useToast } from "./ui";
import { buildPdf } from "../lib/pdf";
import { DOC_DEFAULTS, docSettings } from "../lib/docSettings";
import type { DocSettings } from "../lib/types";

const SWATCHES = ["#0F2742", "#E8590C", "#1D4ED8", "#047857", "#7C3AED", "#111827"];

/** Edit how invoices and estimates look, with a live preview. */
export default function InvoiceLayoutCard() {
  const { store, business, invoices, customers, refresh } = useData();
  const toast = useToast();
  const [d, setD] = useState(() => docSettings(business.doc_settings));
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof DocSettings>(k: K, v: DocSettings[K]) => setD((x) => ({ ...x, [k]: v }));

  function makePreview() {
    const inv = invoices.find((i) => i.status !== "void" && i.status !== "draft") ?? invoices[0];
    const sample = inv
      ? { number: inv.number, items: inv.items, tax_rate: inv.tax_rate, issued: inv.issued_at, due: inv.due_at, customer: customers.find((c) => c.id === inv.customer_id), notes: inv.notes }
      : { number: 1001, items: [{ description: "Service call and diagnosis", qty: 1, unit_cents: 12500 }, { description: "Replacement part", qty: 1, unit_cents: 8900 }], tax_rate: business.tax_rate, issued: new Date().toISOString(), due: new Date(Date.now() + 14 * 86400_000).toISOString(), customer: undefined, notes: "" };
    const pdf = buildPdf({ kind: "Invoice", number: sample.number, business: { ...business, doc_settings: d }, customer: sample.customer, items: sample.items, tax_rate: sample.tax_rate, issued: sample.issued, dateLabel: "Due", dateValue: sample.due, notes: sample.notes });
    setPreview(pdf.output("bloburl").toString());
  }

  const check = (k: "show_logo" | "show_address" | "show_phone" | "show_email" | "show_status", label: string) => (
    <label className="row"><input type="checkbox" checked={Boolean(d[k])} onChange={(e) => set(k, e.target.checked)} /> {label}</label>
  );

  return (
    <div className="card stack">
      <div className="card-title" style={{ margin: 0 }}>Invoice and estimate layout</div>
      <p className="small muted" style={{ margin: 0 }}>Choose how your invoices and estimates look. Changes apply to every new PDF you send.</p>
      <Field label="Header color">
        <div className="row wrap">
          {SWATCHES.map((c) => <button key={c} type="button" aria-label={c} onClick={() => set("accent", c)} style={{ width: 34, height: 34, borderRadius: "50%", background: c, border: d.accent.toLowerCase() === c.toLowerCase() ? "3px solid var(--ink)" : "3px solid transparent", cursor: "pointer" }} />)}
          <input type="color" value={d.accent} onChange={(e) => set("accent", e.target.value)} aria-label="Custom color" style={{ width: 44, height: 34, border: 0, background: "none" }} />
        </div>
      </Field>
      <Field label="Header style">
        <select className="select" value={d.header} onChange={(e) => set("header", e.target.value as "band" | "plain")}>
          <option value="band">Color band across the top</option>
          <option value="plain">White with a color line</option>
        </select>
      </Field>
      <div className="grid2 stack-sm">
        <Field label="Invoice title"><input className="input" value={d.title_invoice} onChange={(e) => set("title_invoice", e.target.value.toUpperCase())} placeholder={DOC_DEFAULTS.title_invoice} /></Field>
        <Field label="Estimate title"><input className="input" value={d.title_estimate} onChange={(e) => set("title_estimate", e.target.value.toUpperCase())} placeholder={DOC_DEFAULTS.title_estimate} /></Field>
      </div>
      <div className="stack" style={{ gap: 8 }}>
        {check("show_logo", "Show my logo")}
        {check("show_address", "Show my address in the header")}
        {check("show_phone", "Show my phone number in the header")}
        {check("show_email", "Show my email in the header")}
        {check("show_status", "Show Paid / Unpaid status on invoices")}
      </div>
      <Field label="Default notes and payment terms on invoices"><textarea className="textarea" value={d.default_notes} onChange={(e) => set("default_notes", e.target.value)} placeholder="Payment due within 14 days. We accept card, check or cash." /></Field>
      <Field label="Default notes on estimates"><textarea className="textarea" value={d.default_estimate_notes} onChange={(e) => set("default_estimate_notes", e.target.value)} placeholder="Estimate valid for 30 days. 50% deposit to schedule." /></Field>
      <Field label="Line above the footer (optional)"><input className="input" value={d.footer} onChange={(e) => set("footer", e.target.value)} placeholder="License #123456 · Fully insured" /></Field>
      <div className="row wrap">
        <button className="btn" onClick={makePreview}>Preview invoice</button>
        <button className="btn primary" disabled={busy} onClick={async () => { setBusy(true); try { await store.saveBusiness({ doc_settings: d }); await refresh(); toast("Layout saved"); } catch (e) { toast(e instanceof Error ? e.message : "Could not save. Run the latest database update first."); } finally { setBusy(false); } }}>Save layout</button>
        <button className="btn" onClick={() => setD(docSettings({}))}>Reset to default</button>
      </div>
      {preview && (
        <Sheet title="Invoice preview" onClose={() => setPreview(null)}>
          <div className="stack">
            <iframe title="Invoice preview" src={preview} style={{ width: "100%", height: "70vh", border: "1px solid var(--line)", borderRadius: 10 }} />
            <a className="btn block" href={preview} target="_blank" rel="noopener">Open in a new tab</a>
          </div>
        </Sheet>
      )}
    </div>
  );
}
