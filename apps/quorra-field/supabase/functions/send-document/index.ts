// Sends a quote or invoice to a customer by email and/or text, as a clean branded message with a link (and an optional PDF).
// Signed-in team members only (leave Verify JWT ON). Secrets: RESEND_API_KEY, FROM_EMAIL; for texts also TWILIO_*.
import { accountOwner, admin, handler, HttpError, json, requireUser } from "../_shared/util.ts";
import { sendEmail, sendSms } from "../_shared/notify.ts";
import { emailHtml } from "../_shared/emailTemplate.ts";
import { fill, getTpl } from "../_shared/templates.ts";

const clip = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);

handler(async (req) => {
  if (req.method !== "POST") throw new HttpError(405, "POST only");
  const user = await requireUser(req);
  const b = await req.json().catch(() => null);
  if (!b) throw new HttpError(400, "Invalid request");
  const kind = b.kind === "invoice" ? "invoice" : "quote";
  const link = typeof b.link === "string" && b.link.startsWith("https://") ? b.link : "";
  const to = clip(b.to, 200).toLowerCase(), phone = clip(b.phone, 40);
  const wantEmail = Boolean(b.channels?.email && to), wantText = Boolean(b.channels?.text && phone);
  if (!wantEmail && !wantText) throw new HttpError(400, "Pick email or text, and make sure the customer has that contact on file");

  const db = admin();
  const owner = await accountOwner(user.id);
  // Only people already in this business's customer list can be messaged through us.
  const { data: custs } = await db.from("customers").select("name,email,phone").eq("owner_id", owner);
  const digits = (s: string) => s.replace(/\D/g, "").slice(-10);
  const cust = (custs ?? []).find((c) => (to && String(c.email ?? "").toLowerCase() === to) || (phone && digits(phone).length >= 7 && digits(String(c.phone ?? "")) === digits(phone)));
  if (!cust) throw new HttpError(403, "That contact is not one of your customers");
  const { data: biz } = await db.from("business").select("name,email,phone,email_templates").eq("owner_id", owner).maybeSingle();
  const bizName = biz?.name || "Your contractor";
  const first = String(cust.name ?? "").split(" ")[0] || "there";
  const title = clip(b.doc_title, 160), amount = clip(b.amount, 40), valid = clip(b.valid_until, 60);
  const noun = kind === "invoice" ? "invoice" : "quote";

  const out: { email?: unknown; text?: unknown } = {};
  if (wantEmail) {
    const att = typeof b.pdf_base64 === "string" && b.pdf_base64.length > 100 && b.pdf_base64.length < 20_000_000 ? [{ filename: clip(b.filename, 80) || `${noun}.pdf`, content: b.pdf_base64 }] : undefined;
    const t = getTpl(biz?.email_templates, kind === "invoice" ? "invoice" : "quote");
    const vars = { customer: first, business: bizName, service: title, date: valid, time: "", address: "", phone: biz?.phone ?? "", total: amount };
    out.email = await sendEmail({
      to, replyTo: biz?.email || undefined, attachments: att,
      subject: fill(t.subject, vars),
      text: `${fill(t.message, vars)}${link ? `\n\n${link}` : ""}\n\n${bizName}${biz?.phone ? `\n${biz.phone}` : ""}`,
      html: emailHtml({
        brand: bizName, preheader: `${kind === "invoice" ? "Invoice" : "Quote"} for ${title}`,
        heading: fill(t.heading, vars),
        paragraphs: fill(t.message, vars).split(/\n{2,}/),
        rows: [{ label: kind === "invoice" ? "Invoice for" : "Quote for", value: title }, ...(amount ? [{ label: kind === "invoice" ? "Balance due" : "Total", value: amount }] : []), ...(valid ? [{ label: kind === "invoice" ? "Due" : "Valid until", value: valid }] : [])],
        button: link ? { label: kind === "invoice" ? "View and pay invoice" : "View and accept quote", url: link } : undefined,
        fine: `${att ? "A PDF copy is attached. " : ""}${biz?.phone ? `Questions? Call ${biz.phone} or reply to this email.` : "Questions? Reply to this email."}`,
      }),
    });
  }
  if (wantText) out.text = await sendSms({ to: phone, body: `Hi ${first}, ${bizName} sent your ${noun} for ${title}${amount ? ` (${amount})` : ""}: ${link}` });
  return json(out);
});
