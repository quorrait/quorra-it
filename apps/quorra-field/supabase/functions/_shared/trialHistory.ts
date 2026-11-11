import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

export async function emailHash(email: string): Promise<string> {
  const norm = email.trim().toLowerCase();
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(norm));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** True when this email or card already used a trial, even if the account was deleted. */
export async function trialAlreadyUsed(db: SupabaseClient, email: string, fingerprint?: string | null): Promise<boolean> {
  const hash = email ? await emailHash(email) : "";
  if (hash) {
    const { data, error } = await db.from("trial_history").select("id").eq("email_hash", hash).limit(1);
    if (error) { console.error(error); throw new Error("trial history"); }
    if (data?.length) return true;
  }
  if (fingerprint) {
    const { data, error } = await db.from("trial_history").select("id").eq("card_fingerprint", fingerprint).limit(1);
    if (error) { console.error(error); throw new Error("trial history"); }
    if (data?.length) return true;
  }
  return false;
}

export async function rememberTrial(db: SupabaseClient, email: string, fingerprint: string | null, customer: string): Promise<void> {
  const hash = email ? await emailHash(email) : null;
  const { error } = await db.from("trial_history").insert({
    email_hash: hash,
    card_fingerprint: fingerprint,
    stripe_customer: customer,
  });
  if (error) console.error("trial history", error);
}
