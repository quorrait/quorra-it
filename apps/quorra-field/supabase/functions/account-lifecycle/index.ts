// Daily unpaid-account mail and deletion. Deploy with --no-verify-jwt.
// Header x-cron-secret must match CRON_SECRET. Schedule once a day.
// Never deletes a canceled, comped, App Review, or platform-admin account.
import { admin, appUrl, handler, HttpError, json } from "../_shared/util.ts";
import { sendEmail } from "../_shared/notify.ts";
import { emailHtml } from "../_shared/emailTemplate.ts";
import { supportEmail } from "../_shared/publicUrl.ts";
import { supportEmail } from "../_shared/publicUrl.ts";

const DAY = 86400000;
const REVIEW_EMAIL = "appreview@quorrait.com";
const TABLES = ["payments", "time_entries", "purchase_orders", "service_plans", "estimates", "invoices", "jobs", "leads", "doc_templates", "price_items", "notifications", "message_log", "customers", "team_members", "invites", "account_members", "cancel_requests", "business", "subscriptions"];

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
      if (await once(db, owner, "grace", today)) {
        await mail(who.email, "Payment failed for Quorra Dispatch", `We could not take the payment for your Quorra Dispatch plan. You have ${left} day${left === 1 ? "" : "s"} of full access left. After that you can view and export your data for 30 days, and then the account and its data are deleted.\n\nUpdate the card: ${billing}`);
        mailed++;
      }
    } else if (day < 37) {
      const reviewerDay = day - 6;
      const kind = reviewerDay === 1 ? "reviewer-1" : reviewerDay === 15 ? "reviewer-15" : reviewerDay === 27 ? "reviewer-27" : "";
      if (kind && await once(db, owner, kind, today)) {
        const soon = reviewerDay === 27 ? ` This is a few days before deletion on ${ends}.` : "";
        await mail(who.email, "View and export your Quorra Dispatch data", `Your payment is still unpaid, so the account is view and export only until ${ends}. Then the account and its data will be deleted.${soon}\n\nPay to restore full access: ${billing}`);
        mailed++;
      }
    } else if (await once(db, owner, "delete", today)) {
      await mail(who.email, "Quorra Dispatch account deleted today", `Your payment is still unpaid. Today we are deleting the Quorra Dispatch account and its data. This does not apply to a plan you canceled while it was paid.`);
      await removeAccount(db, owner, who.email, who.name);
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

async function once(db: ReturnType<typeof admin>, owner: string, kind: string, today: string): Promise<boolean> {
  if (kind !== "grace") {
    const { data } = await db.from("account_notices").select("owner_id").eq("owner_id", owner).eq("kind", kind).limit(1);
    if (data?.length) return false;
  }
  const { error } = await db.from("account_notices").insert({ owner_id: owner, kind, sent_on: today });
  return !error;
}

async function mail(to: string, subject: string, text: string) {
  await sendEmail({
    to,
    replyTo: supportEmail(),
    fromName: "Quorra Dispatch",
    subject,
    text,
    html: emailHtml({ heading: subject, paragraphs: text.split(/\n\n/), fine: `Questions? Email ${supportEmail()}.` }),
  });
}

async function removeAccount(db: ReturnType<typeof admin>, owner: string, email: string, name: string) {
  const { data: already } = await db.from("account_deletions").select("owner_id").eq("owner_id", owner).maybeSingle();
  if (already) return;
  await db.from("account_deletions").insert({ owner_id: owner, email, business_name: name });
  const { data: members } = await db.from("account_members").select("user_id").eq("owner_id", owner);
  const ids = new Set<string>([owner, ...(members ?? []).map((m: { user_id: string }) => m.user_id).filter(Boolean)]);
  for (const table of TABLES) {
    const { error } = await db.from(table).delete().eq("owner_id", owner);
    if (error) console.error("delete", table, error.message);
  }
  for (const id of ids) {
    if (id === owner) continue;
    const { error } = await db.auth.admin.deleteUser(id);
    if (error) console.error("delete user", id, error.message);
  }
  const { error } = await db.auth.admin.deleteUser(owner);
  if (error) console.error("delete owner", owner, error.message);
}
