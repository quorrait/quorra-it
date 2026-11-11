// Manual "nudge to schedule": the business taps a button on an accepted quote that has no visit booked yet.
// Emails (and optionally texts) the customer a link to pick a time. Signed-in team members only (leave Verify JWT ON).
import { accountOwner, admin, handler, HttpError, json, requireUser } from "../_shared/util.ts";
import { assertFeature } from "../_shared/plan.ts";
import { sendEmail, sendSms } from "../_shared/notify.ts";
import { emailHtml } from "../_shared/emailTemplate.ts";
import { fill, getTpl, getStyle } from "../_shared/templates.ts";

handler(async (req) => {
  if (req.method !== "POST") throw new HttpError(405, "POST only");
  const user = await requireUser(req);
  const b = await req.json().catch(() => null);
  const id = typeof b?.estimate_id === "string" ? b.estimate_id : "";
  if (!id) throw new HttpError(400, "Missing quote");
  const wantText = Boolean(b?.text);
  const db = admin();
  const owner = await accountOwner(user.id);
  await assertFeature(owner, "booking");
  const { data: e } = await db.from("estimates").select("id,customer_id,title,status,job_id,quote_link,schedule_nudges").eq("id", id).eq("owner_id", owner).maybeSingle();
  if (!e) throw new HttpError(404, "Quote not found");
  if (e.status !== "approved" || e.job_id) throw new HttpError(400, "This quote is already scheduled or not accepted yet");
  if (!e.quote_link) throw new HttpError(400, "This quote has no scheduling link yet. Send the quote first.");
  const [{ data: biz }, { data: cust }] = await Promise.all([
    db.from("business").select("name,phone,email,email_templates").eq("owner_id", owner).maybeSingle(),
    db.from("customers").select("name,phone,email").eq("id", e.customer_id).maybeSingle(),
  ]);
  const first = (cust?.name ?? "").split(" ")[0] || "there";
  const t = getTpl(biz?.email_templates, "nudge");
  const vars = { customer: first, business: biz?.name ?? "us", service: e.title, date: "", time: "", address: "", phone: biz?.phone ?? "", total: "" };
  const out: { email?: unknown; text?: unknown } = {};
  if (cust?.email) {
    out.email = await sendEmail({
      to: cust.email, replyTo: biz?.email || undefined, fromName: biz?.name,
      subject: fill(t.subject, vars), text: `${fill(t.message, vars)}\n\n${e.quote_link}`,
      html: emailHtml({ brand: biz?.name || "Your contractor", style: getStyle(biz?.email_templates), heading: fill(t.heading, vars), paragraphs: fill(t.message, vars).split(/\n{2,}/), button: { label: "Choose my time", url: e.quote_link as string } }),
    });
  } else out.email = { sent: false, reason: "No email address on file" };
  if (wantText) out.text = cust?.phone ? await sendSms({ to: cust.phone, body: `Hi ${first}, you accepted the quote for ${e.title} with ${biz?.name ?? "us"}. Pick a time that works for you: ${e.quote_link}` }) : { sent: false, reason: "No phone number" };
  const ok = (out.email as { sent?: boolean })?.sent || (out.text as { sent?: boolean } | undefined)?.sent;
  if (ok) await db.from("estimates").update({ schedule_nudges: (e.schedule_nudges ?? 0) + 1 }).eq("id", e.id);
  return json(out);
});
