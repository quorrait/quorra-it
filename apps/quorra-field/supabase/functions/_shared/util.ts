// Shared helpers for the Edge Functions (Deno runtime).
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { PUBLIC_APP_URL } from "./publicUrl.ts";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

export const env = (name: string) => {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing secret ${name}`);
  return v;
};

/** Service-role client: bypasses RLS. Only use after you've checked who's calling. */
export const admin = (): SupabaseClient =>
  createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });

/** Resolve the signed-in user from the request's JWT. */
export async function requireUser(req: Request) {
  const auth = req.headers.get("Authorization");
  if (!auth) throw new HttpError(401, "Not signed in");
  const client = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  });
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new HttpError(401, "Not signed in");
  return data.user;
}

/** The business a signed-in person works for: their own, or the one that invited them. */
export async function accountOwner(userId: string): Promise<string> {
  const { data } = await admin().from("account_members").select("owner_id").eq("user_id", userId).maybeSingle();
  return (data?.owner_id as string | undefined) ?? userId;
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Wrap a handler with CORS + uniform error responses. */
export function handler(fn: (req: Request) => Promise<Response>) {
  Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    try {
      return await fn(req);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      console.error(e);
      return json({ error: e instanceof Error ? e.message : "Server error" }, 500);
    }
  });
}

/* ---- Invoice math: keep identical to src/lib/money.ts and the SQL invoice_total_cents() ---- */
export interface LineItem {
  description: string;
  qty: number;
  unit_cents: number;
}
export const invoiceTotalCents = (items: LineItem[], taxRate: number) => {
  const subtotal = items.reduce((s, li) => s + Math.round(li.qty * li.unit_cents), 0);
  return subtotal + Math.round((subtotal * taxRate) / 100);
};

/**
 * Where the signed-in app lives (Stripe and QuickBooks return here).
 * Set the secret PUBLIC_APP_URL, or the older APP_URL, to https://quorradispatch.com/app
 * (no trailing slash, no hash). If neither secret is set, that address is used.
 */
export const appUrl = () => (Deno.env.get("PUBLIC_APP_URL") || Deno.env.get("APP_URL") || PUBLIC_APP_URL).replace(/\/$/, "");

/** The account owner's id for billing. The real owner, or a team member whose role is set to Owner, may manage billing. */
export async function billingOwner(userId: string): Promise<string> {
  const { data } = await admin().from("account_members").select("owner_id, team_member_id").eq("user_id", userId).maybeSingle();
  if (!data) return userId;
  const { data: tm } = await admin().from("team_members").select("role").eq("id", data.team_member_id).maybeSingle();
  if (tm?.role === "Owner") return data.owner_id as string;
  throw new HttpError(403, "Only the account owner can manage billing");
}
