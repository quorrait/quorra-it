import { jsPDF } from "jspdf";
import { money } from "./money";

/** Our own branded receipt for a Quorra Dispatch subscription payment. */
export function buildReceiptPdf(o: { id: string; date: string; description: string; amount_cents: number; status: string; billedTo: string; email: string }): jsPDF {
  const pdf = new jsPDF({ unit: "pt", format: "letter" });
  const W = 612, M = 56;
  const ORANGE: [number, number, number] = [234, 88, 12];
  const NAVY: [number, number, number] = [15, 23, 42];
  const GRAY: [number, number, number] = [107, 114, 128];
  pdf.setFillColor(...NAVY); pdf.rect(0, 0, W, 96, "F");
  pdf.setTextColor(255, 255, 255); pdf.setFont("helvetica", "bold"); pdf.setFontSize(22); pdf.text("Quorra Dispatch", M, 54);
  pdf.setFont("helvetica", "normal"); pdf.setFontSize(10); pdf.setTextColor(203, 213, 225); pdf.text("Field service software by Quorra IT LLC", M, 72);
  pdf.setTextColor(...ORANGE); pdf.setFont("helvetica", "bold"); pdf.setFontSize(20); pdf.text("RECEIPT", W - M, 58, { align: "right" });

  let y = 142;
  const label = (t: string, x: number, yy: number) => { pdf.setFont("helvetica", "bold"); pdf.setFontSize(9); pdf.setTextColor(...GRAY); pdf.text(t.toUpperCase(), x, yy); };
  const value = (t: string, x: number, yy: number, bold = false) => { pdf.setFont("helvetica", bold ? "bold" : "normal"); pdf.setFontSize(11); pdf.setTextColor(...NAVY); pdf.text(t, x, yy); };
  label("Billed to", M, y); value(o.billedTo || o.email, M, y + 16, true); value(o.email, M, y + 32);
  label("Date paid", 330, y); value(new Date(o.date).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }), 330, y + 16, true);
  label("Receipt number", 330, y + 44); value(o.id.replace(/^in_/, "").slice(-10).toUpperCase(), 330, y + 60, true);

  y = 270;
  pdf.setFillColor(243, 244, 246); pdf.rect(M, y, W - 2 * M, 28, "F");
  pdf.setFont("helvetica", "bold"); pdf.setFontSize(10); pdf.setTextColor(...GRAY);
  pdf.text("DESCRIPTION", M + 12, y + 18); pdf.text("AMOUNT", W - M - 12, y + 18, { align: "right" });
  y += 54;
  value(`${o.description} plan`, M + 12, y); value(money(o.amount_cents), W - M - 12, y); pdf.setLineWidth(0.5); pdf.setDrawColor(229, 231, 235); pdf.line(M, y + 14, W - M, y + 14);
  y += 44;
  pdf.setFont("helvetica", "bold"); pdf.setFontSize(12); pdf.setTextColor(...NAVY); pdf.text("Total paid", W - M - 130, y, { align: "right" });
  pdf.setFontSize(18); pdf.setTextColor(...ORANGE); pdf.text(money(o.amount_cents), W - M - 12, y + 1, { align: "right" });
  pdf.setFont("helvetica", "normal"); pdf.setFontSize(10); pdf.setTextColor(...GRAY);
  pdf.text(`Status: ${o.status === "paid" ? "Paid" : o.status}`, W - M - 12, y + 22, { align: "right" });

  pdf.setFontSize(9); pdf.text("Thank you for choosing Quorra Dispatch. Questions about this receipt? Reply to your billing email or contact quorrait@gmail.com.", M, 720);
  pdf.setTextColor(...ORANGE); pdf.text("quorrait.com/dispatch", M, 736);
  return pdf;
}
