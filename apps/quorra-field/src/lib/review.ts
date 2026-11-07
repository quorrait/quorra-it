import type { Business, Customer } from "./types";

/** Text that asks a happy customer for a review. Opens the phone's Messages (or email on a computer). */
export function reviewRequest(business: Business, customer: Customer, channel: "text" | "email"): string | null {
  const g = (business.review_url ?? "").trim(), y = (business.yelp_url ?? "").trim();
  if (!g && !y) return null;
  const first = customer.name.split(" ")[0] || "there";
  const body = `Hi ${first}, thanks for choosing ${business.name || "us"}. If you were happy with the work, would you leave us a quick review? It really helps a small business: ${g && y ? `Google ${g} or Yelp ${y}` : g || y}`;
  if (channel === "text") return `sms:${customer.phone}?&body=${encodeURIComponent(body)}`;
  return `mailto:${customer.email}?subject=${encodeURIComponent(`How did we do, ${first}?`)}&body=${encodeURIComponent(body)}`;
}
