import { jsPDF } from "jspdf";
import { money } from "./money";

/** Our own branded receipt for a Quorra Dispatch subscription payment. Clean white page, one accent color. */
export function buildReceiptPdf(o: { id: string; date: string; description: string; amount_cents: number; status: string; billedTo: string; email: string }): jsPDF {
  const pdf = new jsPDF({ unit: "pt", format: "letter" });
  const W = 612, M = 60, R = W - M;
  const ORANGE: [number, number, number] = [234, 88, 12];
  const INK: [number, number, number] = [15, 23, 42];
  const MUTE: [number, number, number] = [100, 116, 139];
  const LINE: [number, number, number] = [226, 232, 240];
  const paid = o.status === "paid";
  const date = new Date(o.date).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const text = (t: string, x: number, y: number, size: number, color: [number, number, number], bold = false, align: "left" | "right" = "left") => {
    pdf.setFont("helvetica", bold ? "bold" : "normal").setFontSize(size).setTextColor(...color).text(t, x, y, { align });
  };

  pdf.setFillColor(...ORANGE).rect(0, 0, W, 8, "F");
  pdf.setFillColor(...INK).roundedRect(M, 44, 26, 26, 6, 6, "F");
  pdf.setFillColor(...ORANGE).roundedRect(M + 7, 51, 12, 12, 3, 3, "F");
  text("Quorra Dispatch", M + 38, 62, 17, INK, true);
  text("Receipt", R, 62, 17, MUTE, false, "right");

  // Amount hero
  text("Amount paid", M, 132, 10, MUTE, true);
  text(money(o.amount_cents), M, 172, 40, INK, true);
  text(paid ? `Paid on ${date}` : `${date}`, M, 196, 11, MUTE);
  if (paid) { pdf.setFillColor(220, 252, 231).roundedRect(R - 64, 146, 64, 24, 12, 12, "F"); pdf.setFont("helvetica", "bold").setFontSize(10).setTextColor(22, 101, 52).text("PAID", R - 32, 162, { align: "center" }); }

  pdf.setDrawColor(...LINE).setLineWidth(1).line(M, 224, R, 224);

  // Details, two columns
  const col2 = 330;
  const det = (lab: string, val: string, sub: string, x: number, y: number) => { text(lab, x, y, 9, MUTE, true); text(val, x, y + 17, 12, INK, true); if (sub) text(sub, x, y + 33, 10, MUTE); };
  det("BILLED TO", o.billedTo || o.email, o.billedTo ? o.email : "", M, 254);
  det("RECEIPT NUMBER", o.id.replace(/^in_/, "").slice(-10).toUpperCase(), "", col2, 254);
  det("PAYMENT METHOD", "Card on file", "", M, 314);
  det("DATE", date, "", col2, 314);

  // Line items
  let y = 394;
  text("DESCRIPTION", M, y, 9, MUTE, true); text("AMOUNT", R, y, 9, MUTE, true, "right");
  pdf.setDrawColor(...INK).setLineWidth(1.2).line(M, y + 10, R, y + 10);
  y += 36;
  text(`${o.description} plan`, M, y, 12, INK, true); text(money(o.amount_cents), R, y, 12, INK, false, "right");
  text("Quorra Dispatch subscription", M, y + 15, 10, MUTE);
  pdf.setDrawColor(...LINE).setLineWidth(0.6).line(M, y + 30, R, y + 30);
  y += 64;
  text("Subtotal", R - 150, y, 11, MUTE); text(money(o.amount_cents), R, y, 11, INK, false, "right");
  text("Total paid", R - 150, y + 28, 14, INK, true); text(money(o.amount_cents), R, y + 28, 14, ORANGE, true, "right");

  pdf.setDrawColor(...LINE).setLineWidth(0.6).line(M, 700, R, 700);
  text("Thank you for choosing Quorra Dispatch. Questions about this receipt? Contact quorrait@gmail.com.", M, 722, 9, MUTE);
  text("quorrait.com/dispatch", M, 738, 9, ORANGE, true);
  return pdf;
}
