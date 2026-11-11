/** US street address as Stripe Terminal locations require it. Keep in step with supabase/functions/_shared/usAddress.ts. */
export interface UsAddress {
  line1: string;
  city: string;
  state: string;
  postal_code: string;
  country: "US";
}

/** "123 Main St, Roseville, CA 95678" -> parts. Anything else is not enough for Tap to Pay. */
export function parseUsAddress(raw?: string | null): UsAddress | null {
  const text = (raw ?? "").replace(/\s+/g, " ").trim();
  const match = text.match(/^(.*?),\s*([^,]+?),\s*([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/);
  if (!match) return null;
  const line1 = match[1].trim();
  const city = match[2].trim();
  if (!line1 || !city) return null;
  return { line1, city, state: match[3].toUpperCase(), postal_code: match[4], country: "US" };
}
