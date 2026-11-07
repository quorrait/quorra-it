import { jsPDF } from "jspdf";
import type { Business, Customer, LineItem } from "./types";
import { invoiceTotals, lineTotal, money } from "./money";
import { docSettings, hexToRgb, readableOn } from "./docSettings";
import { renderTemplate } from "./customHtml";

export interface DocInput {
  kind: "Invoice" | "Estimate";
  number: number;
  business: Business;
  customer?: Customer;
  items: LineItem[];
  tax_rate: number;
  issued: string;
  dateLabel: string; // "Due" or "Valid until"
  dateValue: string;
  paid?: number; // cents
  notes?: string;
}

const d = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export function buildPdf(o: DocInput): jsPDF {
  const pdf = new jsPDF({ unit: "pt", format: "letter" });
  const W = 612, M = 48;
  const biz = o.business;
  const contact = [biz.phone, biz.email].filter(Boolean);
  const t = invoiceTotals({ items: o.items, tax_rate: o.tax_rate });
  const paid = o.paid ?? 0;
  const balance = Math.max(0, t.total - paid);
  const isPaid = o.kind === "Invoice" && t.total > 0 && balance === 0;

  const ds = docSettings(biz.doc_settings);
  const accent = hexToRgb(ds.accent);
  const band = ds.header === "band";
  const ink = band ? readableOn(accent) : [20, 20, 20] as [number, number, number];
  const soft: [number, number, number] = band ? (ink[0] === 255 ? [205, 215, 230] : [70, 70, 70]) : [90, 90, 90];
  const title = (o.kind === "Invoice" ? ds.title_invoice : ds.title_estimate) || o.kind.toUpperCase();
  const notes = o.notes || (o.kind === "Invoice" ? ds.default_notes : ds.default_estimate_notes);

  // Header. Logo and company text can sit left, center or right; the title goes to the opposite side.
  const align = ds.company_align, lpos = ds.logo_pos;
  const mirror = align === "right";
  const centered = align === "center";
  const bandH = centered ? 132 : 108;
  if (band) pdf.setFillColor(accent[0], accent[1], accent[2]).rect(0, 0, W, bandH, "F");
  else pdf.setDrawColor(accent[0], accent[1], accent[2]).setLineWidth(3).line(M, bandH - 10, W - M, bandH - 10).setLineWidth(1);
  const lh = { small: 34, medium: 52, large: 72 }[ds.logo_size];
  let textX = mirror ? W - M : centered ? W / 2 : M;
  const tAlign = mirror ? "right" : centered ? "center" : "left";
  let nameY = 46, linesY = 62;
  if (biz.logo && ds.show_logo) {
    try {
      const p = pdf.getImageProperties(biz.logo);
      const h = lh, w = Math.min(lh * 2.2, (p.width / p.height) * h), hh = (w * p.height) / p.width;
      if (centered || lpos !== align) {
        // logo on its own row above the text
        const lx = lpos === "center" ? (W - w) / 2 : lpos === "right" ? W - M - w : M;
        pdf.addImage(biz.logo, p.fileType, lx, 16, w, hh);
        nameY = 16 + hh + 18; linesY = nameY + 15;
      } else {
        const lx = mirror ? W - M - w : M;
        pdf.addImage(biz.logo, p.fileType, lx, 28, w, hh);
        textX = mirror ? lx - 14 : M + w + 14;
      }
    } catch { /* ignore bad logo */ }
  }
  pdf.setFont("helvetica", "bold").setFontSize(17).setTextColor(ink[0], ink[1], ink[2]).text(biz.name, textX, nameY, { align: tAlign });
  pdf.setFont("helvetica", "normal").setFontSize(9.5).setTextColor(soft[0], soft[1], soft[2]);
  const hdrLines = [
    ...(ds.show_address && biz.address ? biz.address.split(/\n|, (?=[A-Z]{2}\b)/) : []),
    ...(ds.show_phone && biz.phone ? [biz.phone] : []),
    ...(ds.show_email && biz.email ? [biz.email] : []),
  ].filter(Boolean);
  pdf.text(hdrLines.slice(0, 4), textX, linesY, { align: tAlign });
  const tx = mirror ? M : W - M, ta = mirror ? "left" : "right";
  pdf.setFont("helvetica", "bold").setFontSize(24).setTextColor(ink[0], ink[1], ink[2]).text(title, tx, 50, { align: ta });
  pdf.setFont("helvetica", "normal").setFontSize(10).setTextColor(band ? 255 : accent[0], band ? 178 : accent[1], band ? 122 : accent[2]).text(`#${o.number}`, tx, 68, { align: ta });

  let y = Math.max(142, bandH + 34);
  // Bill to + dates
  pdf.setFont("helvetica", "bold").setFontSize(8.5).setTextColor(130).text("BILL TO", M, y - 14);
  pdf.setFont("helvetica", "bold").setFontSize(11.5).setTextColor(20).text(o.customer?.name ?? "", M, y);
  pdf.setFont("helvetica", "normal").setFontSize(10).setTextColor(80);
  const to = [o.customer?.address, o.customer?.phone, o.customer?.email].filter(Boolean) as string[];
  pdf.text(to, M, y + 14);
  const label = (txt: string, val: string, yy: number) => {
    pdf.setFont("helvetica", "bold").setFontSize(8.5).setTextColor(130).text(txt, 380, yy);
    pdf.setFont("helvetica", "normal").setFontSize(10.5).setTextColor(20).text(val, W - M, yy, { align: "right" });
  };
  label("ISSUED", d(o.issued), y - 14);
  label(o.dateLabel.toUpperCase(), d(o.dateValue), y + 4);
  if (o.kind === "Invoice" && ds.show_status) label("STATUS", isPaid ? "Paid" : paid > 0 ? "Partly paid" : "Unpaid", y + 22);
  y += Math.max(14 + to.length * 13, 40) + 26;

  // Items
  pdf.setFillColor(238, 241, 245).rect(M, y, W - 2 * M, 22, "F");
  pdf.setFont("helvetica", "bold").setFontSize(8.5).setTextColor(90);
  pdf.text("DESCRIPTION", M + 8, y + 15);
  pdf.text("QTY", 370, y + 15, { align: "right" });
  pdf.text("PRICE", 450, y + 15, { align: "right" });
  pdf.text("AMOUNT", W - M - 8, y + 15, { align: "right" });
  y += 38;

  pdf.setFont("helvetica", "normal").setFontSize(10.5).setTextColor(20);
  for (const li of o.items) {
    const lines = pdf.splitTextToSize(li.description || "Item", 270) as string[];
    if (y + lines.length * 13 > 680) { pdf.addPage(); y = 56; }
    pdf.setTextColor(20).text(lines, M + 8, y);
    pdf.text(String(li.qty), 370, y, { align: "right" });
    pdf.text(money(li.unit_cents), 450, y, { align: "right" });
    pdf.text(money(lineTotal(li)), W - M - 8, y, { align: "right" });
    y += lines.length * 13 + 14;
    pdf.setDrawColor(228).line(M, y - 15, W - M, y - 15);
  }

  // Totals
  if (y > 620) { pdf.addPage(); y = 56; }
  y += 8;
  const row = (lbl: string, val: string) => {
    pdf.setFont("helvetica", "normal").setFontSize(10.5).setTextColor(90);
    pdf.text(lbl, 400, y, { align: "right" });
    pdf.setTextColor(20).text(val, W - M - 8, y, { align: "right" });
    y += 16;
  };
  row("Subtotal", money(t.subtotal));
  row(`Tax (${o.tax_rate}%)`, money(t.tax));
  row("Total", money(t.total));
  if (paid) row("Paid", `-${money(paid)}`);
  if (o.kind === "Invoice") {
    y += 4;
    pdf.setFillColor(isPaid ? 19 : accent[0], isPaid ? 122 : accent[1], isPaid ? 60 : accent[2]).roundedRect(330, y - 14, W - M - 330, 32, 6, 6, "F");
    { const tc = isPaid ? [255, 255, 255] as [number, number, number] : readableOn(accent); pdf.setFont("helvetica", "bold").setFontSize(10).setTextColor(tc[0], tc[1], tc[2]).text(isPaid ? "PAID IN FULL" : "BALANCE DUE", 342, y + 6); pdf.setFontSize(14).text(money(balance), W - M - 10, y + 6, { align: "right" }); }
    y += 44;
  }

  if (notes) {
    pdf.setFont("helvetica", "bold").setFontSize(8.5).setTextColor(130).text(o.kind === "Invoice" ? "NOTES AND PAYMENT TERMS" : "NOTES", M, y);
    pdf.setFont("helvetica", "normal").setFontSize(10).setTextColor(70);
    pdf.text(pdf.splitTextToSize(notes, W - 2 * M) as string[], M, y + 14);
  }

  // Footer: contact details only
  if (ds.footer) pdf.setFont("helvetica", "italic").setFontSize(9.5).setTextColor(90).text(ds.footer, W / 2, 730, { align: "center", maxWidth: W - 2 * M });
  const foot = [biz.name, biz.address?.replace(/\n/g, ", "), ...contact].filter(Boolean).join("  ·  ");
  pdf.setDrawColor(228).line(M, 742, W - M, 742);
  pdf.setFont("helvetica", "normal").setFontSize(8.5).setTextColor(140).text(foot, W / 2, 758, { align: "center", maxWidth: W - 2 * M });
  return pdf;
}

/** Download, or share the file through the phone's share sheet when available (lets the contractor text/email the PDF itself). */
export async function savePdf(pdf: jsPDF, name: string, share = false) {
  const blob = pdf.output("blob");
  const file = new File([blob], name, { type: "application/pdf" });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (share && nav.canShare?.({ files: [file] })) {
    try { await nav.share({ files: [file], title: name }); return; } catch { /* cancelled -> fall through to download */ }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// ---- Designed layouts as a real PDF -----------------------------------------------------------

const NAMED: Record<string, string> = { white: "#ffffff", black: "#000000" };
const rgbOf = (c: string): [number, number, number] => {
  let h = (NAMED[c.toLowerCase()] ?? c).replace("#", "");
  if (h.length === 3) h = h.split("").map((x) => x + x).join("");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
};
/** html2canvas can't read color-mix(), so turn each one into a plain color first. */
function flattenColorMix(html: string): string {
  return html.replace(/color-mix\(\s*in\s+srgb\s*,\s*(#[0-9a-f]{3,6}|[a-z]+)\s+(\d+(?:\.\d+)?)%\s*,\s*(#[0-9a-f]{3,6}|[a-z]+)\s*\)/gi, (_m, a: string, pct: string, b: string) => {
    const k = parseFloat(pct) / 100, x = rgbOf(a), y = rgbOf(b);
    return "#" + x.map((v, i) => Math.round(v * k + y[i] * (1 - k)).toString(16).padStart(2, "0")).join("");
  });
}

/** Renders the business's chosen layout with this document's data and turns it into a PDF (letter pages). */
async function htmlToPdf(html: string): Promise<jsPDF> {
  const { default: html2canvas } = await import("html2canvas");
  const frame = document.createElement("iframe");
  frame.setAttribute("sandbox", "allow-same-origin");
  frame.style.cssText = "position:fixed;left:-10000px;top:0;width:816px;height:1056px;border:0;visibility:hidden";
  document.body.appendChild(frame);
  try {
    await new Promise<void>((res) => { frame.onload = () => res(); frame.srcdoc = flattenColorMix(html).replace(/<\/head>/i, "<style>html,body{background:#fff!important}</style></head>"); });
    const doc = frame.contentDocument!;
    await Promise.race([doc.fonts?.ready ?? Promise.resolve(), new Promise((r) => setTimeout(r, 1500))]);
    const h = Math.max(1056, doc.documentElement.scrollHeight);
    frame.style.height = h + "px";
    const canvas = await html2canvas(doc.documentElement, { scale: 2, width: 816, height: h, windowWidth: 816, windowHeight: h, backgroundColor: "#ffffff", useCORS: true, logging: false });
    const pdf = new jsPDF({ unit: "pt", format: "letter" });
    const fullH = (canvas.height * 612) / canvas.width; // height in pt when scaled to page width
    if (fullH <= 792 * 1.25) { // only a little too tall: shrink to fit one page rather than spilling a few lines onto page 2
      const f = Math.min(1, 792 / fullH), w = 612 * f;
      pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", (612 - w) / 2, 0, w, fullH * f);
      return pdf;
    }
    const pageH = Math.floor((canvas.width * 792) / 612);
    for (let y = 0, n = 0; y < canvas.height; y += pageH, n++) {
      const part = document.createElement("canvas");
      part.width = canvas.width; part.height = Math.min(pageH, canvas.height - y);
      const ctx = part.getContext("2d")!;
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, part.width, part.height);
      ctx.drawImage(canvas, 0, y, canvas.width, part.height, 0, 0, canvas.width, part.height);
      if (n > 0) pdf.addPage();
      pdf.addImage(part.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, 612, (part.height * 612) / canvas.width);
    }
    return pdf;
  } finally { frame.remove(); }
}

/** The PDF customers receive: the chosen designed layout, or the standard one if none is chosen (or it can't be drawn). */
export async function buildDocPdf(o: DocInput): Promise<jsPDF> {
  const tpl = o.business.doc_settings?.custom_html?.trim();
  if (!tpl) return buildPdf(o);
  try {
    const html = renderTemplate(tpl, { kind: o.kind, number: o.number, business: o.business, customer: o.customer, items: o.items, tax_rate: o.tax_rate, issued: o.issued, dateLabel: o.dateLabel, dateValue: o.dateValue, paid: o.paid, notes: o.notes });
    return await htmlToPdf(html);
  } catch { return buildPdf(o); }
}
