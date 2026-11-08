// Sends a quote or invoice to a customer by email and/or text, as a clean branded message with a link (and an optional PDF).
// Signed-in team members only (leave Verify JWT ON). Secrets: RESEND_API_KEY, FROM_EMAIL; for texts also TWILIO_*.
import { accountOwner, admin, handler, HttpError, json, requireUser } from "../_shared/util.ts";
import { sendEmail, sendSms } from "../_shared/notify.ts";
import { emailHtml } from "../_shared/emailTemplate.ts";

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
  const { data: biz } = await db.from("business").select("name,email,phone").eq("owner_id", owner).maybeSingle();
  const bizName = biz?.name || "Your contractor";
  const first = String(cust.name ?? "").split(" ")[0] || "there";
  const title = clip(b.doc_title, 160), amount = clip(b.amount, 40), valid = clip(b.valid_until, 60);
  const noun = kind === "invoice" ? "invoice" : "quote";

  const out: { email?: unknown; text?: unknown } = {};
  if (wantEmail) {
    const att = typeof b.pdf_base64 === "string" && b.pdf_base64.length > 100 && b.pdf_base64.length < 20_000_000 ? [{ filename: clip(b.filename, 80) || `${noun}.pdf`, content: b.pdf_base64 }] : undefined;
    out.email = await sendEmail({
      to, replyTo: biz?.email || undefined, attachments: att,
      subject: kind === "invoice" ? `Invoice from ${bizName}${amount ? `: ${amount}` : ""}` : `Your quote from ${bizName}${amount ? `: ${amount}` : ""}`,
      text: `Hi ${first},\n\nHere is your ${noun} for ${title}${amount ? ` (${amount})` : ""}.${link ? `\n\n${kind === "invoice" ? "View and pay it online" : "View and accept it online"}: ${link}` : ""}\n\nThank you,\n${bizName}${biz?.phone ? `\n${biz.phone}` : ""}`,
      html: emailHtml({
        brand: bizName, preheader: `${kind === "invoice" ? "Invoice" : "Quote"} for ${title}`,
        heading: kind === "invoice" ? "Your invoice is ready" : "Your quote is ready",
        paragraphs: [`Hi ${first}, here is your ${noun} for ${title}.`],
        rows: [{ label: kind === "invoice" ? "Invoice for" : "Quote for", value: title }, ...(amount ? [{ label: kind === "invoice" ? "Balance due" : "Total", value: amount }] : []), ...(valid ? [{ label: kind === "invoice" ? "Due" : "Valid until", value: valid }] : [])],
        button: link ? { label: kind === "invoice" ? "View and pay invoice" : "View and accept quote", url: link } : undefined,
        fine: `${att ? "A PDF copy is attached. " : ""}Questions? Reply to this email${biz?.phone ? ` or call ${biz.phone}` : ""}.`,
      }),
    });
  }
  if (wantText) out.text = await sendSms({ to: phone, body: `Hi ${first}, ${bizName} sent your ${noun} for ${title}${amount ? ` (${amount})` : ""}: ${link}` });
  return json(out);
});
