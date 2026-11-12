/** Shown when Stripe's own text would reveal a key fragment or account-access internals. */
export const STRIPE_ACCOUNT_CLIENT_MESSAGE = "Stripe could not open that account. Please try connecting again.";

/**
 * True when the text names a secret key (including Stripe's masked sk_… form)
 * or explains an account-access failure. Those stay in the server log.
 */
export function stripeMessageLeaksInternals(message: string): boolean {
  if (/\b(?:sk|rk|pk)_/i.test(message)) return true;
  if (/does not have access to account/i.test(message)) return true;
  if (/application access may have been revoked/i.test(message)) return true;
  if (/no such account/i.test(message)) return true;
  if (/\baccount_invalid\b/i.test(message)) return true;
  return false;
}

/** Keep a normal Stripe message. Replace key fragments and account-access internals. */
export function clientStripeMessage(message: string): string {
  const text = message.replace(/\s+/g, " ").trim();
  if (!text || !stripeMessageLeaksInternals(text)) return text;
  return STRIPE_ACCOUNT_CLIENT_MESSAGE;
}

/**
 * The stored connected account cannot be retrieved: it was deleted, the id is
 * unknown, or this platform key is not allowed to use it. A later retry of the
 * same request will not succeed until the id is replaced.
 */
export function staleConnectedAccount(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as {
    code?: string;
    message?: string;
    raw?: { code?: string; message?: string };
    error?: { code?: string; message?: string };
  };
  const code = e.code || e.raw?.code || e.error?.code || "";
  const message = `${e.message ?? ""} ${e.raw?.message ?? ""} ${e.error?.message ?? ""}`;
  if (code === "account_invalid") return true;
  if (/does not have access to account/i.test(message)) return true;
  if (/application access may have been revoked/i.test(message)) return true;
  if (/no such account/i.test(message)) return true;
  if (code === "resource_missing" && /account/i.test(message)) return true;
  return false;
}

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
  return { status: status >= 400 && status < 500 ? status : 502, message: clientStripeMessage(message) };
}

/** A made-up or expired Checkout Session id. Stripe says resource_missing, or "No such checkout.session". */
export function missingCheckoutSession(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { code?: string; message?: string; raw?: { code?: string; message?: string } };
  const code = e.code || e.raw?.code || "";
  const message = `${e.message ?? ""} ${e.raw?.message ?? ""}`;
  return code === "resource_missing" || /No such checkout\.session/i.test(message);
}
