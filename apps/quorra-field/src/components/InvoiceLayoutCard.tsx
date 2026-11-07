import { errMsg } from "../lib/errors";
import { useState } from "react";
import { useData } from "../lib/app";
import { Field, Sheet, useToast } from "./ui";
import { buildPdf } from "../lib/pdf";
import { DOC_DEFAULTS, docSettings } from "../lib/docSettings";
import type { DocSettings } from "../lib/types";
import ColorPick from "./ColorPick";
import TemplateGallery from "./TemplateGallery";
import { INVOICE_TEMPLATES } from "../lib/invoiceTemplates";
import { MAX_DOC_HTML, PLACEHOLDERS, STARTER_DOC, downloadText, openPrintable, renderTemplate } from "../lib/customHtml";

const SWATCHES = ["#0F2742", "#E8590C", "#1D4ED8", "#047857", "#7C3AED", "#111827"];

/** Edit how invoices and estimates look, with a live preview. */
export default function InvoiceLayoutCard() {
  const { store, business, invoices, customers, refresh } = useData();
  const toast = useToast();
  const [d, setD] = useState(() => docSettings(business.doc_settings));
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [custom, setCustom] = useState<string | null>(null);
  const set = <K extends keyof DocSettings>(k: K, v: DocSettings[K]) => setD((x) => ({ ...x, [k]: v }));
  const norm = (o: DocSettings) => JSON.stringify(Object.entries(o).filter(([k, v]) => v !== undefined && !(k === "custom_html" && !v)).sort(([a], [b]) => (a < b ? -1 : 1)));
  const dirty = norm(d) !== norm(docSettings(business.doc_settings));

  /** Saves right away, so choosing, uploading or removing a layout never depends on finding the Save button. */
  async function saveNow(next: DocSettings, msg = "Layout saved") {
    setBusy(true);
    try { await store.saveBusiness({ doc_settings: next }); await refresh(); toast(msg); return true; }
    catch (e) { toast(errMsg(e, "Could not save. Run the latest database update first.")); return false; }
    finally { setBusy(false); }
  }

  function makePreview() {
    const inv = invoices.find((i) => i.status !== "void" && i.status !== "draft") ?? invoices[0];
    const sample = inv
      ? { number: inv.number, items: inv.items, tax_rate: inv.tax_rate, issued: inv.issued_at, due: inv.due_at, customer: customers.find((c) => c.id === inv.customer_id), notes: inv.notes }
      : { number: 1001, items: [{ description: "Service call and diagnosis", qty: 1, unit_cents: 12500 }, { description: "Replacement part", qty: 1, unit_cents: 8900 }], tax_rate: business.tax_rate, issued: new Date().toISOString(), due: new Date(Date.now() + 14 * 86400_000).toISOString(), customer: undefined, notes: "" };
    const pdf = buildPdf({ kind: "Invoice", number: sample.number, business: { ...business, doc_settings: d }, customer: sample.customer, items: sample.items, tax_rate: sample.tax_rate, issued: sample.issued, dateLabel: "Due", dateValue: sample.due, notes: sample.notes });
    setPreview(pdf.output("bloburl").toString());
  }

  function sampleData() {
    const inv = invoices.find((i) => i.status !== "void" && i.status !== "draft") ?? invoices[0];
    return inv
      ? { kind: "Invoice" as const, number: inv.number, business: { ...business, doc_settings: d }, customer: customers.find((c) => c.id === inv.customer_id), items: inv.items, tax_rate: inv.tax_rate, issued: inv.issued_at, dateLabel: "Due", dateValue: inv.due_at, notes: inv.notes }
      : { kind: "Invoice" as const, number: 1001, business: { ...business, doc_settings: d }, customer: undefined, items: [{ description: "Service call and diagnosis", qty: 1, unit_cents: 12500 }, { description: "Replacement part", qty: 1, unit_cents: 8900 }], tax_rate: business.tax_rate, issued: new Date().toISOString(), dateLabel: "Due", dateValue: new Date(Date.now() + 14 * 86400_000).toISOString(), notes: "" };
  }
  /** Fixed sample data so every template thumbnail looks complete. */
  function galleryData() {
    return { kind: "Invoice" as const, number: 1048, business: { ...business, doc_settings: d, name: business.name || "Your Business", phone: business.phone || "(555) 123-4567", email: business.email || "you@company.com" }, customer: { id: "x", name: "Dana Whitfield", phone: "(555) 987-6543", email: "dana@example.com", address: "214 Oak Street, Rocklin CA", notes: "" } as never, items: [{ description: "Service call and diagnosis", qty: 1, unit_cents: 12500 }, { description: "Replacement capacitor", qty: 1, unit_cents: 8900 }, { description: "Labor", qty: 2, unit_cents: 9500 }], tax_rate: business.tax_rate, issued: new Date().toISOString(), dateLabel: "Due", dateValue: new Date(Date.now() + 14 * 86400_000).toISOString(), notes: "Payment due within 14 days. Thank you!" };
  }
  async function upload(f?: File) {
    if (!f) return;
    if (f.size > MAX_DOC_HTML) return toast(`That file is too big. Keep it under ${Math.round(MAX_DOC_HTML / 1000)} KB.`);
    const html = await f.text();
    const next = { ...d, custom_html: html };
    setD(next);
    await saveNow(next, "Layout uploaded and saved");
  }

  const check = (k: "show_logo" | "show_address" | "show_phone" | "show_email" | "show_status", label: string) => (
    <label className="row"><input type="checkbox" checked={Boolean(d[k])} onChange={(e) => set(k, e.target.checked)} /> {label}</label>
  );

  return (
    <details className="card fold">
      <summary><span className="card-title">Invoice and estimate layout</span></summary>
      <div className="stack">
      <p className="small muted" style={{ margin: 0 }}>Choose how your invoices and estimates look. Changes apply to every new PDF you send.</p>
      <div className="feature">
        <div className="row between"><div className="feature-title">Ready-made and custom HTML layouts</div><span className="badge blue">{d.custom_html ? "In use" : "Pick one"}</span></div>
        <div className="stack">
          <div className="bold small">Start from a ready-made layout</div>
          <TemplateGallery items={INVOICE_TEMPLATES} pageW={816} pageH={1056} current={d.custom_html} busy={busy}
            render={(h) => renderTemplate(h, galleryData())}
            previewNote="Sample data shown. Your own customer and line items fill in when you print an invoice."
            onPick={(t) => { const next = { ...d, custom_html: t.html }; setD(next); void saveNow(next, `${t.name} layout saved`); }} />
          <p className="small muted" style={{ margin: 0 }}>After choosing one, open an invoice or estimate and tap <b>Print custom layout</b>. Colors follow your header color below. You can edit the code afterwards.</p>
          <div className="bold small" style={{ marginTop: 6 }}>Or use your own</div>
          <p className="muted" style={{ margin: 0 }}>Upload an HTML file, or paste it, and use the placeholders below where each value should go. On an invoice or estimate, choose <b>Print custom layout</b> and save it as a PDF from the print window. Emailed PDFs keep the standard layout above. Scripts and forms are removed for safety.</p>
          <div className="row wrap">
            <label className="btn">Upload .html<input type="file" accept=".html,.htm,text/html" hidden onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = ""; }} /></label>
            <button type="button" className="btn" onClick={() => downloadText("invoice-layout-starter.html", STARTER_DOC)}>Download a starter file</button>
            {d.custom_html && <button type="button" className="btn" onClick={() => setCustom(renderTemplate(d.custom_html as string, sampleData()))}>Preview my layout</button>}
            {d.custom_html && <button type="button" className="btn" disabled={busy} onClick={() => { const next = { ...d, custom_html: "" }; setD(next); void saveNow(next, "Custom layout removed"); }}>Remove it</button>}
          </div>
          <textarea className="textarea" rows={6} value={d.custom_html ?? ""} maxLength={MAX_DOC_HTML} onChange={(e) => set("custom_html", e.target.value)} placeholder="Or paste your HTML here" style={{ fontFamily: "monospace", fontSize: 12 }} />
          <div className="muted" style={{ columnGap: 16, display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(210px,1fr))" }}>
            {PLACEHOLDERS.map(([k, v]) => <div key={k}><code>{k}</code> {v}</div>)}
          </div>
        </div>
      </div>
      <Field label="Header color"><ColorPick value={d.accent} onChange={(c) => set("accent", c)} swatches={SWATCHES} label="Header color" /></Field>
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
        <button className="btn primary" disabled={busy} onClick={() => void saveNow(d)}>Save layout</button>
        <button className="btn" onClick={() => setD(docSettings({}))}>Reset to default</button>
      </div>
      {dirty && (
        <div className="savebar" role="status">
          <span>You have unsaved changes</span>
          <button className="btn primary sm" disabled={busy} onClick={() => void saveNow(d)}>{busy ? "Saving..." : "Save layout"}</button>
        </div>
      )}
      {custom && (
        <Sheet title="Your layout (sample)" onClose={() => setCustom(null)}>
          <div className="stack">
            <iframe title="Custom layout preview" sandbox="" srcDoc={custom} style={{ width: "100%", height: "70vh", border: "1px solid var(--line)", borderRadius: 10, background: "#fff" }} />
            <button className="btn block" onClick={() => openPrintable(custom)}>Open in a new tab to print</button>
          </div>
        </Sheet>
      )}
      {preview && (
        <Sheet title="Invoice preview" onClose={() => setPreview(null)}>
          <div className="stack">
            <iframe title="Invoice preview" src={preview} style={{ width: "100%", height: "70vh", border: "1px solid var(--line)", borderRadius: 10 }} />
            <a className="btn block" href={preview} target="_blank" rel="noopener">Open in a new tab</a>
          </div>
        </Sheet>
      )}
      </div>
    </details>
  );
}
