import { jsPDF } from "jspdf";
import type { Business, Customer, LineItem } from "./types";
import { invoiceTotals, lineTotal, money } from "./money";

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
  let y = 56;

  if (o.business.logo) {
    try {
      const p = pdf.getImageProperties(o.business.logo);
      const h = 44, w = Math.min(140, (p.width / p.height) * h);
      pdf.addImage(o.business.logo, p.fileType, M, y - 12, w, w ? (w * p.height) / p.width : h);
    } catch { /* ignore bad logo */ }
  }
  pdf.setFont("helvetica", "bold").setFontSize(22).setTextColor(20);
  pdf.text(o.kind.toUpperCase(), W - M, y, { align: "right" });
  pdf.setFont("helvetica", "normal").setFontSize(10).setTextColor(110);
  pdf.text(`#${o.number}`, W - M, y + 16, { align: "right" });
  y += 56;

  pdf.setFont("helvetica", "bold").setFontSize(12).setTextColor(20).text(o.business.name, M, y);
  pdf.setFont("helvetica", "normal").setFontSize(10).setTextColor(90);
  pdf.text([o.business.phone, o.business.email].filter(Boolean).join("  ·  "), M, y + 14);

  pdf.setFont("helvetica", "bold").setFontSize(9).setTextColor(130).text("BILL TO", 340, y - 2);
  pdf.setFont("helvetica", "normal").setFontSize(10).setTextColor(20);
  const to = [o.customer?.name ?? "", o.customer?.address ?? "", o.customer?.email ?? ""].filter(Boolean);
  pdf.text(to, 340, y + 12);
  y += 14 + to.length * 13 + 16;

  pdf.setFontSize(10).setTextColor(90);
  pdf.text(`Issued ${d(o.issued)}   ·   ${o.dateLabel} ${d(o.dateValue)}`, M, y);
  y += 20;

  pdf.setFillColor(238, 241, 245).rect(M, y, W - 2 * M, 22, "F");
  pdf.setFont("helvetica", "bold").setFontSize(9).setTextColor(90);
  pdf.text("DESCRIPTION", M + 8, y + 15);
  pdf.text("QTY", 370, y + 15, { align: "right" });
  pdf.text("PRICE", 450, y + 15, { align: "right" });
  pdf.text("AMOUNT", W - M - 8, y + 15, { align: "right" });
  y += 36;

  pdf.setFont("helvetica", "normal").setFontSize(10.5).setTextColor(20);
  for (const li of o.items) {
    const lines = pdf.splitTextToSize(li.description || "Item", 270) as string[];
    if (y + lines.length * 13 > 700) { pdf.addPage(); y = 56; }
    pdf.text(lines, M + 8, y);
    pdf.text(String(li.qty), 370, y, { align: "right" });
    pdf.text(money(li.unit_cents), 450, y, { align: "right" });
    pdf.text(money(lineTotal(li)), W - M - 8, y, { align: "right" });
    y += lines.length * 13 + 14;
    pdf.setDrawColor(228).line(M, y - 15, W - M, y - 15);
  }

  const t = invoiceTotals({ items: o.items, tax_rate: o.tax_rate });
  y += 10;
  const row = (label: string, val: string, bold = false) => {
    pdf.setFont("helvetica", bold ? "bold" : "normal").setFontSize(bold ? 13 : 10.5).setTextColor(bold ? 20 : 90);
    pdf.text(label, 400, y, { align: "right" });
    pdf.text(val, W - M - 8, y, { align: "right" });
    y += bold ? 20 : 16;
  };
  row("Subtotal", money(t.subtotal));
  row(`Tax (${o.tax_rate}%)`, money(t.tax));
  row("Total", money(t.total), true);
  if (o.paid) { row("Paid", `-${money(o.paid)}`); row("Balance due", money(t.total - o.paid), true); }

  if (o.notes) {
    y += 16;
    pdf.setFont("helvetica", "normal").setFontSize(10).setTextColor(90);
    pdf.text(pdf.splitTextToSize(o.notes, W - 2 * M) as string[], M, y);
  }
  pdf.setFontSize(9).setTextColor(150).text(`Thank you for your business — ${o.business.name}`, W / 2, 750, { align: "center" });
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
