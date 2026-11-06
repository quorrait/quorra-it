import type { Invoice, LineItem, Payment } from "./types";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const usd0 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export const money = (cents: number) => usd.format(cents / 100);
export const moneyShort = (cents: number) => usd0.format(cents / 100);

export const lineTotal = (li: LineItem) => Math.round(li.qty * li.unit_cents);

export function invoiceTotals(inv: Pick<Invoice, "items" | "tax_rate">) {
  const subtotal = inv.items.reduce((s, li) => s + lineTotal(li), 0);
  const tax = Math.round((subtotal * inv.tax_rate) / 100);
  return { subtotal, tax, total: subtotal + tax };
}

export function amountPaid(invoiceId: string, payments: Payment[]) {
  return payments.filter((p) => p.invoice_id === invoiceId).reduce((s, p) => s + p.amount_cents, 0);
}

export function balanceDue(inv: Invoice, payments: Payment[]) {
  return Math.max(0, invoiceTotals(inv).total - amountPaid(inv.id, payments));
}

export function isOverdue(inv: Invoice, payments: Payment[], now = new Date()) {
  return (
    (inv.status === "sent") &&
    new Date(inv.due_at).getTime() < now.getTime() &&
    balanceDue(inv, payments) > 0
  );
}
