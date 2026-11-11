// Emails the signed-in owner sample copies of the customer emails (reminder, quote, schedule nudge, payment receipt). Deploy with JWT ON.
import { admin, appUrl, assertBilling, handler, json, requireUser, accountOwner } from "../_shared/util.ts";
import { sendEmail } from "../_shared/notify.ts";
import { emailHtml } from "../_shared/emailTemplate.ts";
import { fill, getTpl, getStyle } from "../_shared/templates.ts";

handler(async (req) => {
  const user = await requireUser(req);
  const owner = (await accountOwner(user.id)) ?? user.id;
  await assertBilling(owner);
  const { data: biz } = await admin().from("business").select("name,phone").eq("owner_id", owner).maybeSingle();
  const brand = biz?.name || "Your Company";
  const to = user.email as string;
  const url = `${appUrl()}/`;
  const { data: full } = await admin().from("business").select("email_templates").eq("owner_id", owner).maybeSingle();
  const vars = { customer: "Sam", business: brand, service: "AC tune-up", date: "Tuesday, November 10", time: "9:00 AM", address: "123 Main St", phone: biz?.phone ?? "(916) 555-0100", total: "$285.00" };
  const mk = (key: "reminder" | "quote" | "invoice" | "nudge", extra: Record<string, unknown>) => {
    const t = getTpl(full?.email_templates, key);
    return { subject: `[Sample] ${fill(t.subject, vars)}`, html: emailHtml({ brand, style: getStyle(full?.email_templates), heading: fill(t.heading, vars), paragraphs: fill(t.message, vars).split(/\n{2,}/), ...extra }) };
  };
  const samples = [
    mk("reminder", { rows: [{ label: "Service", value: "AC tune-up" }, { label: "Appointment", value: "Tuesday, November 10 at 9:00 AM" }, { label: "Location", value: "123 Main St" }] }),
    mk("quote", { rows: [{ label: "Quote for", value: "AC tune-up" }, { label: "Total", value: "$285.00" }, { label: "Valid until", value: "December 8" }], button: { label: "View and accept quote", url } }),
    mk("invoice", { rows: [{ label: "Invoice for", value: "AC tune-up" }, { label: "Balance due", value: "$285.00" }], button: { label: "View and pay invoice", url } }),
    mk("nudge", { button: { label: "Choose my time", url } }),
    { subject: "[Sample] Receipt for your payment", html: emailHtml({ brand, style: getStyle(full?.email_templates), heading: "Thanks for your payment", paragraphs: ["We received your payment of $285.00."], rows: [{ label: "Amount", value: "$285.00" }, { label: "Date", value: new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) }], button: { label: "View receipt", url }, fine: "Questions about your bill? Just reply to this email." }) },
  ];
  let sent = 0, reason = "";
  for (const s of samples) { const r = await sendEmail({ to, fromName: brand, subject: s.subject, text: s.subject, html: s.html }); if (r.sent) sent++; else reason = r.reason ?? ""; }
  return json({ ok: sent > 0, sent, to, reason });
});
