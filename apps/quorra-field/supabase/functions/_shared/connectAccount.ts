/**
 * Standard-style connected accounts on Accounts v2.
 * Stripe rejects Accounts v1 `type: "standard"`. The v2 equivalent that keeps
 * the contractor on the full Stripe Dashboard, with Stripe collecting fees and
 * covering losses, is a merchant account with card payments requested.
 * Direct charges stay on that account. Nothing here sets an application fee.
 *
 * API shape checked against the Accounts v2 create reference
 * (Stripe-Version 2026-10-28.endive): dashboard full, fees_collector stripe,
 * losses_collector stripe, configuration.merchant.capabilities.card_payments.
 */

export const STRIPE_V2_VERSION = "2026-10-28.endive";

/** Capability status changed. This event is scoped to "Your account", not "Connected accounts". */
export const V2_CARD_PAYMENTS_EVENT = "v2.core.account[configuration.merchant].capability_status_updated";

export class StripeCallError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export interface ConnectAccountInput {
  email?: string | null;
  name?: string | null;
}

/** Body for POST /v2/core/accounts. No v1 `type`, no customer configuration, no application fee. */
export function standardConnectedAccountBody(input: ConnectAccountInput): Record<string, unknown> {
  const email = (input.email ?? "").trim();
  const name = (input.name ?? "").trim();
  return {
    ...(email ? { contact_email: email } : {}),
    ...(name ? { display_name: name } : {}),
    dashboard: "full",
    identity: { country: "us" },
    configuration: {
      merchant: {
        capabilities: {
          card_payments: { requested: true },
        },
      },
    },
    defaults: {
      currency: "usd",
      responsibilities: {
        fees_collector: "stripe",
        losses_collector: "stripe",
      },
    },
    include: ["configuration.merchant", "defaults", "identity"],
  };
}

export interface CardPaymentsAccount {
  id?: string;
  dashboard?: string | null;
  charges_enabled?: boolean | null;
  capabilities?: { card_payments?: string | null } | null;
  defaults?: { responsibilities?: { fees_collector?: string | null; losses_collector?: string | null } | null } | null;
  configuration?: {
    merchant?: {
      capabilities?: { card_payments?: { status?: string | null } | null } | null;
    } | null;
  } | null;
}

/**
 * True when the account can take card payments.
 * v1 Standard accounts (including ones already connected in production) expose charges_enabled.
 * v2 accounts expose configuration.merchant.capabilities.card_payments.status.
 * A v1 retrieve of a v2 account may populate capabilities.card_payments as well.
 */
export function cardPaymentsActive(account: CardPaymentsAccount | null | undefined): boolean {
  if (!account) return false;
  if (account.charges_enabled === true) return true;
  if (account.capabilities?.card_payments === "active") return true;
  return account.configuration?.merchant?.capabilities?.card_payments?.status === "active";
}

/** When the create response includes these fields, they must match a Standard-style account. */
export function standardStyleMismatch(account: CardPaymentsAccount): string | null {
  if (account.dashboard && account.dashboard !== "full") {
    return `Stripe created a ${account.dashboard} dashboard account instead of a full dashboard.`;
  }
  const fees = account.defaults?.responsibilities?.fees_collector;
  const losses = account.defaults?.responsibilities?.losses_collector;
  if (fees && fees !== "stripe") return "Stripe did not set fee collection on the contractor's account.";
  if (losses && losses !== "stripe") return "Stripe did not leave loss cover with Stripe.";
  if (account.configuration && !account.configuration.merchant) return "Stripe did not enable card payments on the account.";
  const status = account.configuration?.merchant?.capabilities?.card_payments?.status;
  if (status === "unrequested") return "Stripe did not request card payments.";
  return null;
}

export function messageFromStripeBody(body: unknown, status: number): { status: number; message: string } {
  const record = body && typeof body === "object" ? body as { error?: { message?: string }; message?: string } : {};
  const message = (record.error?.message || record.message || `Stripe request failed (${status})`).trim();
  return { status: status >= 400 && status < 500 ? status : 502, message };
}

export async function stripeV2(
  secret: string,
  method: "GET" | "POST",
  path: string,
  body?: unknown,
  idempotencyKey?: string,
): Promise<{ status: number; json: unknown }> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${secret}`,
    "Stripe-Version": STRIPE_V2_VERSION,
  };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
  const res = await fetch(`https://api.stripe.com${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: unknown = {};
  if (text) {
    try { json = JSON.parse(text); } catch { json = { message: text.slice(0, 500) }; }
  }
  return { status: res.status, json };
}

export async function createStandardConnectedAccount(
  secret: string,
  input: ConnectAccountInput & { idempotencyKey: string },
): Promise<{ id: string }> {
  const { status, json } = await stripeV2(
    secret,
    "POST",
    "/v2/core/accounts",
    standardConnectedAccountBody(input),
    input.idempotencyKey,
  );
  if (status < 200 || status >= 300) {
    const parsed = messageFromStripeBody(json, status);
    throw new StripeCallError(parsed.status, parsed.message);
  }
  const account = (json ?? {}) as CardPaymentsAccount;
  const mismatch = standardStyleMismatch(account);
  if (mismatch) throw new StripeCallError(502, mismatch);
  if (!account.id) throw new StripeCallError(502, "Stripe did not return an account id.");
  return { id: account.id };
}

/** Look up card-payment capability. 4xx means "use the v1 snapshot"; 429/5xx should be retried. */
export async function retrieveV2CardPayments(secret: string, accountId: string): Promise<"active" | "inactive" | "unknown" | "retry"> {
  const path = `/v2/core/accounts/${encodeURIComponent(accountId)}?include=configuration.merchant`;
  const { status, json } = await stripeV2(secret, "GET", path);
  if (status === 429 || status >= 500) return "retry";
  if (status < 200 || status >= 300) return "unknown";
  return cardPaymentsActive(json as CardPaymentsAccount) ? "active" : "inactive";
}
