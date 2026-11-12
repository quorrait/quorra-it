// Daily unpaid-account mail and deletion. Deploy with --no-verify-jwt.
// Header x-cron-secret must match CRON_SECRET. Schedule once a day.
// Never deletes a canceled, comped, App Review, or platform-admin account.
// A failed delete is not recorded, so the next daily run retries it.
import Stripe from "https://esm.sh/stripe@16.12.0?target=denonext";
import { admin, appUrl, handler, HttpError, json } from "../_shared/util.ts";
import { sendEmail } from "../_shared/notify.ts";
import { emailHtml } from "../_shared/emailTemplate.ts";
import { supportEmail } from "../_shared/publicUrl.ts";

const DAY = 86400000;
const REVIEW_EMAIL = "appreview@quorrait.com";
const TABLES = ["qbo_connections", "payments", "time_entries", "purchase_orders", "service_plans", "estimates", "invoices", "jobs", "leads", "doc_templates", "price_items", "notifications", "message_log", "customers", "team_members", "invites", "account_members", "cancel_requests", "business"];

handler(async (req) => {
  const secret = Deno.env.get("CRON_SECRET");
  if (!secret || req.headers.get("x-cron-secret") !== secret) throw new HttpError(401, "Not allowed");
  const db = admin();
  const now = Date.now();
  const today = new Date(now).toISOString().slice(0, 10);
  const { data: rows } = await db.from("subscriptions").select("owner_id,status,comped,past_due_since").eq("status", "past_due");
  let mailed = 0, deleted = 0;
  for (const row of rows ?? []) {
    if (row.comped || !row.past_due_since) continue;
    const since = new Date(row.past_due_since).getTime();
    const day = Math.floor((now - since) / DAY);
    const owner = row.owner_id as string;
    const who = await accountOf(db, owner);
    if (!who || who.skip) continue;
    const billing = `${appUrl()}/billing`;
    const ends = new Date(since + 37 * DAY).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
    if (day < 7) {
      const left = 7 - day;
      if (await sendNotice(db, owner, "grace", today, who.email, "Payment failed for Quorra Dispatch", `We could not take the payment for your Quorra Dispatch plan. You have ${left} day${left === 1 ? "" : "s"} of full access left. After that you can view and export your data for 30 days, and then the account and its data are deleted.\n\nUpdate the card: ${billing}`, true)) mailed++;
    } else if (day < 37) {
      const reviewerDay = day - 6;
      const due = [reviewerDay >= 1 ? "reviewer-1" : "", reviewerDay >= 15 ? "reviewer-15" : "", reviewerDay >= 27 ? "reviewer-27" : ""].filter(Boolean);
      for (const kind of due) {
        const soon = kind === "reviewer-27" ? ` This is a few days before deletion on ${ends}.` : "";
        if (await sendNotice(db, owner, kind, today, who.email, "View and export your Quorra Dispatch data", `Your payment is still unpaid, so the account is view and export only until ${ends}. Then the account and its data will be deleted.${soon}\n\nPay to restore full access: ${billing}`, false)) mailed++;
      }
    } else if (await removeAccount(db, owner)) {
      deleted++;
    }
  }
  return json({ ok: true, mailed, deleted });
});

async function accountOf(db: ReturnType<typeof admin>, owner: string): Promise<{ email: string; name: string; skip: boolean } | null> {
  const { data: user } = await db.auth.admin.getUserById(owner);
  const email = user?.user?.email?.trim().toLowerCase() ?? "";
  const { data: biz } = await db.from("business").select("name").eq("owner_id", owner).maybeSingle();
  const name = String(biz?.name ?? "");
  if (!email) return null;
  if (email === REVIEW_EMAIL || name.toLowerCase() === "demo hvac co") return { email, name, skip: true };
  const { data: staff } = await db.from("platform_admins").select("email").ilike("email", email).maybeSingle();
  if (staff) return { email, name, skip: true };
  return { email, name, skip: false };
}

/** Grace is one row per calendar day. Reviewer notices are one row per kind. */
async function noticeSent(db: ReturnType<typeof admin>, owner: string, kind: string, today: string | null): Promise<boolean> {
  let q = db.from("account_notices").select("owner_id").eq("owner_id", owner).eq("kind", kind);
  if (today) q = q.eq("sent_on", today);
  const { data, error } = await q.limit(1);
  if (error) { console.error("notice lookup", owner, kind, error.message); return true; }
  return Boolean(data?.length);
}

/** Send first. The notice is written only after the email succeeds, so a failed send is retried. */
async function sendNotice(db: ReturnType<typeof admin>, owner: string, kind: string, today: string, to: string, subject: string, text: string, daily: boolean): Promise<boolean> {
  if (await noticeSent(db, owner, kind, daily ? today : null)) return false;
  const result = await sendEmail({
    to,
    replyTo: supportEmail(),
    fromName: "Quorra Dispatch",
    subject,
    text,
    html: emailHtml({ heading: subject, paragraphs: text.split(/\n\n/), fine: `Questions? Email ${supportEmail()}.` }),
  });
  if (!result.sent) { console.error("notice email", owner, kind, result.reason); return false; }
  const { error } = await db.from("account_notices").insert({ owner_id: owner, kind, sent_on: today });
  if (error) console.error("notice record", owner, kind, error.message);
  return true;
}

/** True when this run finished a delete. False when it was already finished. Throws if a delete fails before the log is written, so the next day still sees past_due and retries. */
async function removeAccount(db: ReturnType<typeof admin>, owner: string): Promise<boolean> {
  const { data: already } = await db.from("account_deletions").select("owner_id").eq("owner_id", owner).maybeSingle();
  if (already) {
    await deleteAuthUsers(db, await userIds(db, owner), false);
    return false;
  }

  const { data: user } = await db.auth.admin.getUserById(owner);
  const email = user?.user?.email ?? "";
  const { data: biz } = await db.from("business").select("name").eq("owner_id", owner).maybeSingle();
  const name = String(biz?.name ?? "");
  const { data: sub } = await db.from("subscriptions").select("stripe_customer_id, stripe_subscription_id").eq("owner_id", owner).maybeSingle();
  const stripeCustomerId = (sub?.stripe_customer_id as string | null) ?? null;
  const stripeSubscriptionId = (sub?.stripe_subscription_id as string | null) ?? null;
  const ids = await userIds(db, owner);

  if (ids.length) {
    const { error: sessions } = await db.from("user_sessions").delete().in("user_id", ids);
    if (sessions) throw new HttpError(500, `user_sessions: ${sessions.message}`);
    const { error: tokens } = await db.from("device_tokens").delete().in("user_id", ids);
    if (tokens) throw new HttpError(500, `device_tokens: ${tokens.message}`);
  }
  for (const table of TABLES) {
    const { error } = await db.from(table).delete().eq("owner_id", owner);
    if (error) throw new HttpError(500, `${table}: ${error.message}`);
  }
  await deleteAuthUsers(db, ids.filter((id) => id !== owner), true);

  // Platform Quorra Dispatch subscription only. The subscriptions row stays until the deletion is logged,
  // so a failure here still leaves status past_due for the next run. Do not cancel a Stripe Connect account,
  // and do not call the TrueFlow ("Quorra") account or the plan-billing webhook.
  if (stripeSubscriptionId) {
    try {
      const key = Deno.env.get("STRIPE_SECRET_KEY");
      if (!key) console.error("stripe cancel skipped: STRIPE_SECRET_KEY is not set", owner);
      else {
        const stripe = new Stripe(key, { httpClient: Stripe.createFetchHttpClient() });
        const live = await stripe.subscriptions.retrieve(stripeSubscriptionId);
        if (live.status !== "canceled") await stripe.subscriptions.cancel(stripeSubscriptionId);
      }
    } catch (e) {
      console.error("stripe cancel", owner, stripeCustomerId, e);
    }
  }

  const { error: logged } = await db.from("account_deletions").insert({ owner_id: owner, email, business_name: name });
  if (logged) throw new HttpError(500, `account_deletions: ${logged.message}`);
  const sent = await sendEmail({
    to: email,
    replyTo: supportEmail(),
    fromName: "Quorra Dispatch",
    subject: "Quorra Dispatch account deleted today",
    text: "Your payment is still unpaid. Today we deleted the Quorra Dispatch account and its data. This does not apply to a plan you canceled while it was paid.",
    html: emailHtml({ heading: "Quorra Dispatch account deleted today", paragraphs: ["Your payment is still unpaid. Today we deleted the Quorra Dispatch account and its data.", "This does not apply to a plan you canceled while it was paid."], fine: `Questions? Email ${supportEmail()}.` }),
  });
  if (!sent.sent) console.error("deletion email", owner, sent.reason);
  const { error: subGone } = await db.from("subscriptions").delete().eq("owner_id", owner);
  if (subGone) console.error("subscriptions", owner, subGone.message);
  await deleteAuthUsers(db, [owner], true);
  return true;
}

async function userIds(db: ReturnType<typeof admin>, owner: string): Promise<string[]> {
  const { data: members } = await db.from("account_members").select("user_id").eq("owner_id", owner);
  return [...new Set([owner, ...(members ?? []).map((m: { user_id: string }) => m.user_id).filter(Boolean)])];
}

async function deleteAuthUsers(db: ReturnType<typeof admin>, ids: string[], strict: boolean) {
  for (const id of ids) {
    const { error } = await db.auth.admin.deleteUser(id);
    if (error && !userAlreadyGone(error.message)) {
      if (strict) throw new HttpError(500, `user ${id}: ${error.message}`);
      console.error("leftover user", id, error.message);
    }
  }
}

function userAlreadyGone(message: string): boolean {
  return /not found|does not exist/i.test(message);
}
