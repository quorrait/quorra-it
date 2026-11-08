// Emails the signed-in owner sample copies of the customer emails (reminder, quote, schedule nudge, payment receipt). Deploy with JWT ON.
import { admin, handler, json, requireUser, accountOwner } from "../_shared/util.ts";
import { sendEmail } from "../_shared/notify.ts";
import { emailHtml } from "../_shared/emailTemplate.ts";

handler(async (req) => {
  const user = await requireUser(req);
  const owner = (await accountOwner(user.id)) ?? user.id;
  const { data: biz } = await admin().from("business").select("name,phone").eq("owner_id", owner).maybeSingle();
  const brand = biz?.name || "Your Company";
  const to = user.email as string;
  const url = "https://www.quorrait.com/field-test/";
  const samples = [
    { subject: "[Sample] Reminder: your visit is coming up", html: emailHtml({ brand, heading: "Your visit is coming up", paragraphs: ["Hi Sam, a quick reminder about your upcoming service."], rows: [{ label: "What", value: "AC tune-up" }, { label: "When", value: "Tuesday, 9:00 AM" }, { label: "Where", value: "123 Main St" }, ...(biz?.phone ? [{ label: "Questions?", value: biz.phone }] : [])] }) },
    { subject: "[Sample] Your quote is ready", html: emailHtml({ brand, heading: "Your quote is ready", paragraphs: ["Hi Sam, your quote for AC tune-up is ready to review."], rows: [{ label: "Total", value: "$285.00" }, { label: "Valid until", value: "in 30 days" }], button: { label: "View quote", url } }) },
    { subject: "[Sample] Pick a time for your visit", html: emailHtml({ brand, heading: "Pick a time for your visit", paragraphs: ["Hi Sam, thanks for accepting the quote. Choose a day and time that works for you."], button: { label: "Choose my time", url } }) },
    { subject: "[Sample] Receipt for your payment", html: emailHtml({ brand, heading: "Thanks for your payment", paragraphs: ["We received your payment of $285.00."], rows: [{ label: "Amount", value: "$285.00" }, { label: "Date", value: new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) }], button: { label: "View receipt", url }, fine: "Questions about your bill? Just reply to this email." }) },
  ];
  let sent = 0, reason = "";
  for (const s of samples) { const r = await sendEmail({ to, subject: s.subject, text: s.subject, html: s.html }); if (r.sent) sent++; else reason = r.reason ?? ""; }
  return json({ ok: sent > 0, sent, to, reason });
});
