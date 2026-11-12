/** Stripe SDK and API errors carry the message we should show. Other errors do not. */
export function stripeFailure(error: unknown): { status: number; message: string } | null {
  if (!error || typeof error !== "object") return null;
  const e = error as {
    type?: string;
    message?: string;
    statusCode?: number;
    raw?: { message?: string };
    error?: { message?: string };
  };
  const stripeType = typeof e.type === "string" && (e.type.startsWith("Stripe") || e.type === "invalid_request_error" || e.type === "api_error");
  const message = (e.raw?.message || e.error?.message || (stripeType ? e.message : "") || "").trim();
  if (!message || message === "Server error") return null;
  if (!stripeType && !e.raw?.message && !e.error?.message) return null;
  const status = typeof e.statusCode === "number" ? e.statusCode : 400;
  return { status: status >= 400 && status < 500 ? status : 502, message };
}

/** A made-up or expired Checkout Session id. Stripe says resource_missing, or "No such checkout.session". */
export function missingCheckoutSession(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { code?: string; message?: string; raw?: { code?: string; message?: string } };
  const code = e.code || e.raw?.code || "";
  const message = `${e.message ?? ""} ${e.raw?.message ?? ""}`;
  return code === "resource_missing" || /No such checkout\.session/i.test(message);
}
