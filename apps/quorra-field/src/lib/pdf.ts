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
  const biz = o.business;
  const contact = [biz.phone, biz.email].filter(Boolean);
  const t = invoiceTotals({ items: o.items, tax_rate: o.tax_rate });
  const paid = o.paid ?? 0;
  const balance = Math.max(0, t.total - paid);
  const isPaid = o.kind === "Invoice" && t.total > 0 && balance === 0;

  // Header band
  pdf.setFillColor(15, 39, 66).rect(0, 0, W, 108, "F");
  let textX = M;
  if (biz.logo) {
    try {
      const p = pdf.getImageProperties(biz.logo);
      const h = 52, w = Math.min(110, (p.width / p.height) * h), hh = (w * p.height) / p.width;
      pdf.addImage(biz.logo, p.fileType, M, 28, w, hh);
      textX = M + w + 14;
    } catch { /* ignore bad logo */ }
  }
  pdf.setFont("helvetica", "bold").setFontSize(17).setTextColor(255).text(biz.name, textX, 46);
  pdf.setFont("helvetica", "normal").setFontSize(9.5).setTextColor(205, 215, 230);
  const bizLines = [...(biz.address ? biz.address.split(/\n|, (?=[A-Z]{2}\b)/) : []), ...contact].filter(Boolean);
  pdf.text(bizLines.slice(0, 4), textX, 62);
  pdf.setFont("helvetica", "bold").setFontSize(24).setTextColor(255).text(o.kind.toUpperCase(), W - M, 50, { align: "right" });
  pdf.setFont("helvetica", "normal").setFontSize(10).setTextColor(255, 178, 122).text(`#${o.number}`, W - M, 68, { align: "right" });

  let y = 142;
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
  if (o.kind === "Invoice") label("STATUS", isPaid ? "Paid" : paid > 0 ? "Partly paid" : "Unpaid", y + 22);
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
    pdf.setFillColor(isPaid ? 19 : 232, isPaid ? 122 : 89, isPaid ? 60 : 12).roundedRect(330, y - 14, W - M - 330, 32, 6, 6, "F");
    pdf.setFont("helvetica", "bold").setFontSize(10).setTextColor(255).text(isPaid ? "PAID IN FULL" : "BALANCE DUE", 342, y + 6);
    pdf.setFontSize(14).text(money(balance), W - M - 10, y + 6, { align: "right" });
    y += 44;
  }

  if (o.notes) {
    pdf.setFont("helvetica", "bold").setFontSize(8.5).setTextColor(130).text(o.kind === "Invoice" ? "NOTES AND PAYMENT TERMS" : "NOTES", M, y);
    pdf.setFont("helvetica", "normal").setFontSize(10).setTextColor(70);
    pdf.text(pdf.splitTextToSize(o.notes, W - 2 * M) as string[], M, y + 14);
  }

  // Footer: contact details only
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
