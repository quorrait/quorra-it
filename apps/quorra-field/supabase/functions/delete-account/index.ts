// Lets an account owner delete their own company and login (and cancels their Quorra Dispatch plan). Signed-in only (Verify JWT ON).
// Secrets: STRIPE_SECRET_KEY (optional, to cancel the plan).
import Stripe from "https://esm.sh/stripe@16.12.0?target=denonext";
import { accountOwner, admin, handler, HttpError, json, requireUser } from "../_shared/util.ts";

handler(async (req) => {
  if (req.method !== "POST") throw new HttpError(405, "POST only");
  const user = await requireUser(req);
  const b = await req.json().catch(() => ({}));
  if (String(b.confirm ?? "").trim().toLowerCase() !== (user.email ?? "").toLowerCase()) throw new HttpError(400, "Type your login email exactly to confirm");
  if ((await accountOwner(user.id)) !== user.id) throw new HttpError(403, "Only the account owner can delete the company. Ask them to remove your access instead.");
  const db = admin();
  const { data: sub } = await db.from("subscriptions").select("stripe_subscription_id,comped").eq("owner_id", user.id).maybeSingle();
  const key = Deno.env.get("STRIPE_SECRET_KEY");
  if (key && sub?.stripe_subscription_id) {
    try { await new Stripe(key, { httpClient: Stripe.createFetchHttpClient() }).subscriptions.cancel(sub.stripe_subscription_id); } catch { /* already canceled */ }
  }
  const { error } = await db.auth.admin.deleteUser(user.id); // cascades to every row this company owns
  if (error) throw new HttpError(500, error.message);
  return json({ ok: true });
});
