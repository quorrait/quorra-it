/** A made-up or expired Checkout Session id. Stripe says resource_missing, or "No such checkout.session". */
export function missingCheckoutSession(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { code?: string; message?: string; raw?: { code?: string; message?: string } };
  const code = e.code || e.raw?.code || "";
  const message = `${e.message ?? ""} ${e.raw?.message ?? ""}`;
  return code === "resource_missing" || /No such checkout\.session/i.test(message);
}
