// A signed-in user sends a support request from the app. It is saved for the Hub and emailed to you. Leave Verify JWT ON.
import { admin, accountOwner, handler, HttpError, json, requireUser } from "../_shared/util.ts";
import { sendEmail } from "../_shared/notify.ts";
import { emailHtml } from "../_shared/emailTemplate.ts";
import { supportEmail } from "../_shared/publicUrl.ts";

const clean = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
const CATS = ["question", "problem", "billing", "idea"];

handler(async (req) => {
  if (req.method !== "POST") throw new HttpError(405, "POST only");
  const user = await requireUser(req);
  const owner = await accountOwner(user.id);
  const b = await req.json().catch(() => ({}));
  const subject = clean(b.subject, 150), message = clean(b.message, 4000);
  const category = CATS.includes(b.category) ? b.category : "question";
  if (!subject || !message) throw new HttpError(400, "Add a subject and a message.");
  const db = admin();
  const { data: biz } = await db.from("business").select("name").eq("owner_id", owner).maybeSingle();
  const email = user.email ?? "";
  const { error } = await db.from("support_tickets").insert({ owner_id: owner, user_email: email, business_name: biz?.name ?? "", category, subject, message });
  if (error) throw new HttpError(500, "Could not save your request. Please try again.");
  await sendEmail({
    to: supportEmail(), replyTo: email || undefined,
    subject: `Support (${category}): ${subject}`,
    text: `From: ${biz?.name ?? ""} (${email})\nType: ${category}\n\n${message}`,
    html: emailHtml({ heading: subject, rows: [{ label: "Type", value: category }, { label: "Business", value: biz?.name || "-" }, { label: "Email", value: email || "-" }], paragraphs: message.split(/\n{2,}/), button: email ? { label: "Reply", url: `mailto:${email}` } : undefined }),
  });
  return json({ ok: true });
});
