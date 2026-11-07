import { errMsg } from "../lib/errors";
import { useEffect, useRef, useState } from "react";
import { useData } from "../lib/app";
import { Field, Sheet, Step, useToast } from "./ui";
import { buildPdf } from "../lib/pdf";
import { DOC_DEFAULTS, docSettings } from "../lib/docSettings";
import type { Customer, DocSettings } from "../lib/types";
import ColorPick from "./ColorPick";
import TemplateGallery from "./TemplateGallery";
import { INVOICE_TEMPLATES } from "../lib/invoiceTemplates";
import { MAX_DOC_HTML, PLACEHOLDERS, STARTER_DOC, downloadText, openPrintable, renderTemplate } from "../lib/customHtml";

const SWATCHES = ["#0F2742", "#E8590C", "#1D4ED8", "#047857", "#7C3AED", "#111827"];
const SAMPLE_CUSTOMER: Customer = { id: "sample", name: "Dana Whitfield", phone: "(555) 987-6543", email: "dana@example.com", address: "214 Oak Street, Rocklin CA", notes: "" };


/** Page-sized iframe scaled to fit its container width. */
function Scaled({ html }: { html: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(340);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth || 340)); ro.observe(el); setW(el.clientWidth || 340);
    return () => ro.disconnect();
  }, []);
  const k = w / 816;
  return (
    <div ref={ref} style={{ width: "100%", height: 1056 * k, overflow: "hidden", border: "1px solid var(--line)", borderRadius: 10, background: "#fff" }}>
      <iframe title="Live preview" sandbox="" srcDoc={html} style={{ width: 816, height: 1056, border: 0, transform: `scale(${k})`, transformOrigin: "0 0", pointerEvents: "none" }} />
    </div>
  );
}

/** Invoice and estimate look: pick a layout, set the color and wording, preview, and (for designers) use custom HTML. */
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

  const [liveUrl, setLiveUrl] = useState("");
  const activeTpl = INVOICE_TEMPLATES.find((t) => t.html === d.custom_html);
  const isStandard = !d.custom_html?.trim();
  const isCustom = !isStandard && !activeTpl;

  const stdKey = isStandard ? JSON.stringify([d, business.name, business.phone, business.email, business.address, business.logo]) : "";
  useEffect(() => {
    if (!isStandard) return;
    const t = setTimeout(() => { try { const s = sampleData(); setLiveUrl(buildPdf({ kind: "Invoice", number: s.number, business: s.business, customer: s.customer, items: s.items, tax_rate: s.tax_rate, issued: s.issued, dateLabel: "Due", dateValue: s.dateValue, notes: s.notes }).output("bloburl").toString() + "#toolbar=0&navpanes=0"); } catch { /* keep last */ } }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stdKey]);

  /** Saves right away, so choosing, uploading or removing a layout never depends on finding the Save button. */
  async function saveNow(next: DocSettings, msg = "Layout saved") {
    setBusy(true);
    try { await store.saveBusiness({ doc_settings: next }); await refresh(); toast(msg); return true; }
    catch (e) { toast(errMsg(e, "Could not save. Run the latest database update first.")); return false; }
    finally { setBusy(false); }
  }

  const realInvoice = () => invoices.find((i) => i.status !== "void" && i.status !== "draft") ?? invoices[0];
  function sampleData() {
    const inv = realInvoice();
    const biz = { ...business, doc_settings: d };
    return inv
      ? { kind: "Invoice" as const, number: inv.number, business: biz, customer: customers.find((c) => c.id === inv.customer_id), items: inv.items, tax_rate: inv.tax_rate, issued: inv.issued_at, dateLabel: "Due", dateValue: inv.due_at, notes: inv.notes }
      : { kind: "Invoice" as const, number: 1001, business: biz, customer: undefined, items: [{ description: "Service call and diagnosis", qty: 1, unit_cents: 12500 }, { description: "Replacement part", qty: 1, unit_cents: 8900 }], tax_rate: business.tax_rate, issued: new Date().toISOString(), dateLabel: "Due", dateValue: new Date(Date.now() + 14 * 86400_000).toISOString(), notes: "" };
  }
  /** Fixed sample data so every thumbnail looks complete. */
  function galleryData() {
    return { kind: "Invoice" as const, number: 1048, business: { ...business, doc_settings: d, name: business.name || "Your Business", phone: business.phone || "(555) 123-4567", email: business.email || "you@company.com" }, customer: SAMPLE_CUSTOMER, items: [{ description: "Service call and diagnosis", qty: 1, unit_cents: 12500 }, { description: "Replacement capacitor", qty: 1, unit_cents: 8900 }, { description: "Labor", qty: 2, unit_cents: 9500 }], tax_rate: business.tax_rate, issued: new Date().toISOString(), dateLabel: "Due", dateValue: new Date(Date.now() + 14 * 86400_000).toISOString(), notes: "Payment due within 14 days. Thank you!" };
  }
  function makeStandardPreview() {
    const s = sampleData();
    const pdf = buildPdf({ kind: "Invoice", number: s.number, business: s.business, customer: s.customer, items: s.items, tax_rate: s.tax_rate, issued: s.issued, dateLabel: "Due", dateValue: s.dateValue, notes: s.notes });
    setPreview(pdf.output("bloburl").toString());
  }
  async function upload(f?: File) {
    if (!f) return;
    if (f.size > MAX_DOC_HTML) return toast(`That file is too big. Keep it under ${Math.round(MAX_DOC_HTML / 1000)} KB.`);
    const next = { ...d, custom_html: await f.text() };
    setD(next);
    await saveNow(next, "Design uploaded and saved");
  }

  const check = (k: "show_logo" | "show_address" | "show_phone" | "show_email" | "show_status", label: string) => (
    <label className="row"><input type="checkbox" checked={Boolean(d[k])} onChange={(e) => set(k, e.target.checked)} /> {label}</label>
  );

  return (
    <details className="card fold">
      <summary><span className="card-title">Invoice and estimate layout</span></summary>
      <div className="stack">
        <p className="small muted" style={{ margin: 0 }}>Choose how your invoices and estimates look. Open any invoice or estimate and tap <b>Print custom layout</b> to print it or save it as a PDF.</p>

        <Step n={1} title="Choose a layout" hint="Tap a preview to see it full size. Your color and business details fill in automatically.">
          <TemplateGallery items={INVOICE_TEMPLATES} pageW={816} pageH={1056} currentId={activeTpl?.id} busy={busy}
            render={(h) => renderTemplate(h, galleryData())}
            previewNote="Sample customer and items shown. Your real invoice details fill in when you print."
            onPick={(t) => { const next = { ...d, custom_html: t.html }; setD(next); void saveNow(next, `${t.name} layout saved`); }} />
          {isStandard && <div className="notice">You are using the <b>standard PDF layout</b>. Pick a layout above to use a designed one when printing.</div>}
          {isCustom && <div className="notice">You are using your own HTML design (see Advanced below). Pick a layout above to replace it.</div>}
          {!isStandard && <div><button type="button" className="btn sm" disabled={busy} onClick={() => { const next = { ...d, custom_html: "" }; setD(next); void saveNow(next, "Back to the standard layout"); }}>Use the standard PDF layout instead</button></div>}
          <p className="small muted" style={{ margin: 0 }}>The PDF that is emailed to customers always uses the standard layout, set up in step 2 and the standard options below.</p>
        </Step>

        <div className="split">
          <div>
        <Step n={2} title="Color and wording">
          <div className="grid2 stack-sm">
            <Field label="Color"><ColorPick value={d.accent} onChange={(c) => set("accent", c)} swatches={SWATCHES} label="Color" /></Field>
            <div />
          </div>
          <Field label="Default notes and payment terms on invoices"><textarea className="textarea" value={d.default_notes} onChange={(e) => set("default_notes", e.target.value)} placeholder="Payment due within 14 days. We accept card, check or cash." /></Field>
          <Field label="Default notes on estimates"><textarea className="textarea" value={d.default_estimate_notes} onChange={(e) => set("default_estimate_notes", e.target.value)} placeholder="Estimate valid for 30 days. 50% deposit to schedule." /></Field>
          <details className="adv">
            <summary>Standard PDF options</summary>
            <div className="stack" style={{ marginTop: 10 }}>
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
              <Field label="Line above the footer (optional)"><input className="input" value={d.footer} onChange={(e) => set("footer", e.target.value)} placeholder="License #123456 · Fully insured" /></Field>
            </div>
          </details>
        </Step>
          </div>
          <div className="stack sticky" style={{ gap: 6 }}>
            <div className="bold small">Live preview</div>
            {isStandard
              ? (liveUrl ? <iframe title="Live preview" src={liveUrl} style={{ width: "100%", height: 560, border: "1px solid var(--line)", borderRadius: 12, background: "#fff" }} /> : <p className="small muted">Preparing preview...</p>)
              : <Scaled html={renderTemplate(d.custom_html as string, sampleData())} />}
            <div className="small muted">Updates as you edit. Sample items shown unless you have an invoice.</div>
          </div>
        </div>

        <div className="row wrap">
          <button className="btn primary" disabled={busy || !dirty} onClick={() => void saveNow(d)}>{busy ? "Saving..." : "Save changes"}</button>
          <button className="btn" onClick={() => setD(docSettings({}))}>Reset to default</button>
          {!isStandard && <button className="btn" onClick={() => openPrintable(renderTemplate(d.custom_html as string, sampleData()))}>Open to print</button>}
        </div>

        <details className="adv">
          <summary>Advanced: custom HTML design</summary>
          <div className="stack" style={{ marginTop: 10 }}>
            <p className="small muted" style={{ margin: 0 }}>For a web designer, or if you already have an invoice design. Upload an HTML file or paste it, and put the placeholders below where each value should go. It replaces the layout chosen above. Scripts and forms are removed for safety.</p>
            <div className="row wrap">
              <label className="btn">Upload .html<input type="file" accept=".html,.htm,text/html" hidden onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = ""; }} /></label>
              <button type="button" className="btn" onClick={() => downloadText("invoice-layout-starter.html", STARTER_DOC)}>Download a starter file</button>
            </div>
            <textarea className="textarea" rows={6} value={d.custom_html ?? ""} maxLength={MAX_DOC_HTML} onChange={(e) => set("custom_html", e.target.value)} placeholder="Or paste your HTML here" style={{ fontFamily: "monospace", fontSize: 12 }} />
            <div className="muted" style={{ columnGap: 16, display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(210px,1fr))" }}>
              {PLACEHOLDERS.map(([k, v]) => <div key={k}><code>{k}</code> {v}</div>)}
            </div>
          </div>
        </details>

        {dirty && (
          <div className="savebar" role="status">
            <span>You have unsaved changes</span>
            <button className="btn primary sm" disabled={busy} onClick={() => void saveNow(d)}>{busy ? "Saving..." : "Save changes"}</button>
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
          <Sheet title="Standard PDF preview" onClose={() => setPreview(null)}>
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
