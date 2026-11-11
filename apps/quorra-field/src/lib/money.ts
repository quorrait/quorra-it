import type { Invoice, LineItem, Payment } from "./types";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const usd0 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export const money = (cents: number) => usd.format(cents / 100);
export const moneyShort = (cents: number) => usd0.format(cents / 100);

/** Round half away from zero, in integer arithmetic. Matches Postgres round(numeric). */
function roundRatio(numerator: bigint, scale: bigint): number {
  const neg = numerator < 0n;
  const abs = neg ? -numerator : numerator;
  const half = scale / 2n;
  const rounded = (abs + half) / scale;
  const n = Number(rounded);
  return neg ? -n : n;
}

function scaled(n: number, places: number): bigint {
  if (!Number.isFinite(n)) return 0n;
  const [whole, frac = ""] = Math.abs(n).toFixed(places).split(".");
  return BigInt(whole + (frac + "0".repeat(places)).slice(0, places));
}

/** qty × unit cents, rounded to a whole cent. Float multiply is a cent or two off (4.02 × 125 is 502.5, and Math.round sees 502.499…). */
export function lineTotal(li: Pick<LineItem, "qty" | "unit_cents">): number {
  const qty = scaled(li.qty, 4);
  const unit = BigInt(Math.trunc(Math.abs(li.unit_cents)));
  const neg = li.qty < 0 !== li.unit_cents < 0;
  return roundRatio((neg ? -1n : 1n) * qty * unit, 10000n);
}

/** Tax in cents. rate is a percent such as 7.75. */
export function taxCents(subtotalCents: number, taxRate: number): number {
  const rate = scaled(taxRate, 2);
  const neg = subtotalCents < 0 !== taxRate < 0;
  const sub = BigInt(Math.trunc(Math.abs(subtotalCents)));
  return roundRatio((neg ? -1n : 1n) * sub * rate, 10000n);
}

export function invoiceTotals(inv: Pick<Invoice, "items" | "tax_rate">) {
  const subtotal = inv.items.reduce((s, li) => s + lineTotal(li), 0);
  const tax = taxCents(subtotal, inv.tax_rate);
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
