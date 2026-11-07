import type { Business, Customer, LineItem } from "./types";
import { invoiceTotals, lineTotal, money } from "./money";
import { fmtDate } from "./dates";

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

export const MAX_DOC_HTML = 100_000;
export const MAX_FORM_HTML = 30_000;

/**
 * Makes an uploaded layout safe to open: no scripts, frames, forms, handlers or javascript: links,
 * and a content policy that blocks scripts even if something slipped through.
 */
export function sanitizeTemplate(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("script,iframe,frame,frameset,object,embed,base,form,meta[http-equiv]").forEach((n) => n.remove());
  doc.querySelectorAll("*").forEach((el) => {
    for (const a of Array.from(el.attributes)) {
      const n = a.name.toLowerCase();
      if (n.startsWith("on") || ((n === "href" || n === "src" || n === "xlink:href" || n === "action" || n === "formaction") && /^\s*(javascript|data:text\/html|vbscript):/i.test(a.value))) el.removeAttribute(a.name);
    }
  });
  const meta = doc.createElement("meta");
  meta.setAttribute("http-equiv", "Content-Security-Policy");
  meta.setAttribute("content", "script-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'");
  doc.head.prepend(meta);
  return "<!doctype html>" + doc.documentElement.outerHTML;
}

export interface DocData {
  kind: "Invoice" | "Estimate";
  title?: string;
  number: number | string;
  business: Business;
  customer?: Customer;
  items: LineItem[];
  tax_rate: number;
  issued: string;
  dateLabel: string;
  dateValue: string;
  paid?: number;
  notes?: string;
  status?: string;
}

export const PLACEHOLDERS: [string, string][] = [
  ["{{title}}", "INVOICE or ESTIMATE"], ["{{number}}", "Document number"], ["{{issued}}", "Issue date"],
  ["{{date_label}}", "Due or Valid until"], ["{{date_value}}", "That date"],
  ["{{business_name}}", "Your business name"], ["{{business_phone}}", "Your phone"], ["{{business_email}}", "Your email"], ["{{business_address}}", "Your address"], ["{{logo}}", "Your logo (an image)"],
  ["{{customer_name}}", "Customer name"], ["{{customer_address}}", "Customer address"], ["{{customer_phone}}", "Customer phone"], ["{{customer_email}}", "Customer email"],
  ["{{items_table}}", "Whole table of line items"], ["{{items}}", "Just the table rows (<tr>), for your own table"],
  ["{{subtotal}}", "Subtotal"], ["{{tax}}", "Tax"], ["{{total}}", "Total"], ["{{paid}}", "Amount paid"], ["{{balance}}", "Balance due"], ["{{status}}", "Paid or Unpaid"], ["{{notes}}", "Notes"], ["{{accent}}", "Your header color (for CSS)"], ["{{footer}}", "Your footer line"], ["{{biz_style}}", "Put in style=\"\" on your company block (follows the alignment setting)"],
];

export function renderTemplate(tpl: string, d: DocData): string {
  const ds0 = d.business.doc_settings ?? {};
  const t = invoiceTotals({ items: d.items, tax_rate: d.tax_rate });
  const paid = d.paid ?? 0;
  const rows = d.items.map((li) => `<tr><td>${esc(li.description || "Item")}</td><td style="text-align:right">${esc(li.qty)}</td><td style="text-align:right">${esc(money(li.unit_cents))}</td><td style="text-align:right">${esc(money(lineTotal(li)))}</td></tr>`).join("");
  const table = `<table style="width:100%;border-collapse:collapse"><thead><tr><th style="text-align:left">Description</th><th style="text-align:right">Qty</th><th style="text-align:right">Price</th><th style="text-align:right">Amount</th></tr></thead><tbody>${rows}</tbody></table>`;
  const pos = ds0.logo_pos ?? "left", al = ds0.company_align ?? "left", px = { small: 36, medium: 60, large: 90 }[ds0.logo_size ?? "medium"];
  const logoMargin = pos === "center" ? "0 auto 8px" : pos === "right" ? "0 0 8px auto" : "0 0 8px 0";
  const logo = d.business.logo && /^data:image\/(png|jpe?g|gif|webp);base64,/i.test(d.business.logo) ? `<img src="${esc(d.business.logo)}" alt="" style="display:block;margin:${logoMargin};max-height:${px}px;max-width:70%">` : "";
  const ds = d.business.doc_settings ?? {};
  const defTitle = (d.kind === "Invoice" ? ds.title_invoice : ds.title_estimate)?.trim() || d.kind.toUpperCase();
  const v: Record<string, string> = {
    title: esc(d.title ?? defTitle), number: esc(d.number), issued: esc(fmtDate(d.issued)), date_label: esc(d.dateLabel), date_value: esc(fmtDate(d.dateValue)),
    business_name: esc(d.business.name), business_phone: ds.show_phone === false ? "" : esc(d.business.phone), business_email: ds.show_email === false ? "" : esc(d.business.email), business_address: ds.show_address === false ? "" : esc(d.business.address ?? ""), logo: ds.show_logo === false ? "" : logo,
    footer: esc(ds.footer ?? ""),
    biz_style: al === "left" ? "" : `flex:1;text-align:${al}`,
    customer_name: esc(d.customer?.name ?? ""), customer_address: esc(d.customer?.address ?? ""), customer_phone: esc(d.customer?.phone ?? ""), customer_email: esc(d.customer?.email ?? ""),
    items_table: table, items: rows,
    subtotal: esc(money(t.subtotal)), tax: esc(money(t.tax)), total: esc(money(t.total)), paid: esc(money(paid)), balance: esc(money(Math.max(0, t.total - paid))),
    accent: /^#[0-9a-f]{6}$/i.test(d.business.doc_settings?.accent ?? "") ? (d.business.doc_settings!.accent as string) : "#0F2742",
    status: d.kind === "Invoice" && ds.show_status !== false ? (paid >= t.total && t.total > 0 ? "Paid" : "Unpaid") : "", notes: esc(d.notes ?? "").replace(/\n/g, "<br>"),
  };
  return sanitizeTemplate(tpl.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_, k: string) => v[k.toLowerCase()] ?? ""));
}

/** Opens the finished page in a new tab so it can be printed or saved as a PDF from the browser. */
export function openPrintable(html: string) {
  const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
  window.open(url, "_blank", "noopener");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function downloadText(name: string, text: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "text/html" }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

export const STARTER_DOC = `<!doctype html>
<html><head><meta charset="utf-8"><title>{{title}} {{number}}</title>
<style>
  body { font-family: Arial, sans-serif; color: #111; margin: 40px; }
  h1 { margin: 0; letter-spacing: .05em; }
  .top { display: flex; justify-content: space-between; align-items: flex-start; }
  th, td { padding: 8px 6px; border-bottom: 1px solid #ddd; }
  .totals { margin-left: auto; width: 260px; margin-top: 16px; }
  .totals div { display: flex; justify-content: space-between; padding: 4px 0; }
</style></head>
<body>
  <div class="top">
    <div>{{logo}}<h2>{{business_name}}</h2>{{business_address}}<br>{{business_phone}} {{business_email}}</div>
    <div style="text-align:right"><h1>{{title}}</h1>No. {{number}}<br>Issued {{issued}}<br>{{date_label}} {{date_value}}<br><b>{{status}}</b></div>
  </div>
  <p><b>Bill to</b><br>{{customer_name}}<br>{{customer_address}}</p>
  {{items_table}}
  <div class="totals">
    <div><span>Subtotal</span><span>{{subtotal}}</span></div>
    <div><span>Tax</span><span>{{tax}}</span></div>
    <div><b>Total</b><b>{{total}}</b></div>
    <div><span>Paid</span><span>{{paid}}</span></div>
    <div><b>Balance due</b><b>{{balance}}</b></div>
  </div>
  <p>{{notes}}</p>
</body></html>
`;

export const STARTER_FORM = `<!doctype html>
<html><head><meta charset="utf-8">
<style>
  body { font-family: Arial, sans-serif; margin: 0; padding: 16px; color: #111; }
  h2 { margin: 0 0 8px; }
  label { display: block; margin: 10px 0 4px; font-weight: bold; font-size: 14px; }
  input, textarea, select { width: 100%; padding: 10px; border: 1px solid #bbb; border-radius: 6px; font: inherit; box-sizing: border-box; }
  button { margin-top: 14px; padding: 12px 18px; border: 0; border-radius: 6px; background: #e8590c; color: #fff; font-size: 16px; font-weight: bold; cursor: pointer; }
</style></head>
<body>
  <h2>Request service</h2>
  <form>
    <label>Name *</label><input name="name" required>
    <label>Phone</label><input name="phone" type="tel">
    <label>Email</label><input name="email" type="email">
    <label>Service address</label><input name="address">
    <label>What do you need?</label><input name="service">
    <label>Details</label><textarea name="message" rows="4"></textarea>
    <button type="submit">Send request</button>
  </form>
</body></html>
`;
