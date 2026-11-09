import type { Invoice, Payment } from "./types";

/** A fingerprint of everything QuickBooks shows for an invoice. When it changes, the invoice is updated there. */
export const invoiceHash = (i: Invoice) => JSON.stringify([i.number, i.customer_id, i.issued_at, i.due_at, i.tax_rate, i.items.map((l) => [l.description, l.qty, l.unit_cents])]);

export interface QboJob { id: string; action: "sync" | "void"; hash: string; key: string }

/** Invoices whose QuickBooks copy is missing or out of date: new, edited, voided, or with payments not sent yet. */
export function qboPending(invoices: Invoice[], payments: Payment[]): QboJob[] {
  const out: QboJob[] = [];
  for (const i of invoices) {
    const hash = invoiceHash(i);
    if (i.status === "void") { if (i.qbo_id && i.qbo_hash !== "void") out.push({ id: i.id, action: "void", hash, key: `${i.id}:void` }); continue; }
    if (i.status !== "sent" && i.status !== "paid") continue;
    const unpaid = payments.some((p) => p.invoice_id === i.id && !p.qbo_id);
    if (!i.qbo_id || (i.qbo_hash !== hash && i.qbo_hash !== "imported") || unpaid) out.push({ id: i.id, action: "sync", hash, key: `${i.id}:${hash}:${unpaid}` });
  }
  return out;
}
