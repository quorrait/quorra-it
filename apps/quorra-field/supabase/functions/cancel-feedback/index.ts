// Saves why an owner is cancelling and emails it to you. Signed-in owners only (leave Verify JWT ON).
import { admin, accountOwner, assertBilling, handler, HttpError, json, requireUser } from "../_shared/util.ts";
import { sendEmail } from "../_shared/notify.ts";
import { emailHtml } from "../_shared/emailTemplate.ts";
import { supportEmail } from "../_shared/publicUrl.ts";

const clean = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);

handler(async (req) => {
  if (req.method !== "POST") throw new HttpError(405, "POST only");
  const user = await requireUser(req);
  const owner = await accountOwner(user.id);
  await assertBilling(owner);
  if (owner !== user.id) throw new HttpError(403, "Only the account owner can cancel");
  const b = await req.json().catch(() => ({}));
  const reason = clean(b.reason, 120);
  if (!reason) throw new HttpError(400, "Please tell us why you are cancelling.");
  const db = admin();
  const { data: biz } = await db.from("business").select("name").eq("owner_id", owner).maybeSingle();
  const r = { owner_id: owner, email: user.email ?? "", business: biz?.name ?? "", reason, details: clean(b.details, 2000), contact_me: Boolean(b.contact_me), phone: clean(b.phone, 40) };
  const { error } = await db.from("cancel_requests").insert(r);
  if (error) { console.error(error); throw new HttpError(500, "Server error"); }
  await sendEmail({
    to: supportEmail(),
    subject: `${r.contact_me ? "[CONTACT ME] " : ""}Cancellation: ${r.business || r.email}`,
    replyTo: r.email || undefined,
    text: `Business: ${r.business}\nEmail: ${r.email}\nPhone: ${r.phone}\nWants a call back: ${r.contact_me ? "YES" : "no"}\nReason: ${r.reason}\n\n${r.details}`,
    html: emailHtml({
      heading: r.contact_me ? "Cancellation: wants a call back" : "A customer is cancelling",
      preheader: `${r.business || r.email}: ${r.reason}`,
      rows: [
        { label: "Business", value: r.business || "-" }, { label: "Email", value: r.email || "-" }, ...(r.phone ? [{ label: "Phone", value: r.phone }] : []),
        { label: "Reason", value: r.reason }, { label: "Wants a call back", value: r.contact_me ? "Yes" : "No" },
      ],
      paragraphs: r.details ? [r.details] : [],
      button: r.contact_me && r.phone ? { label: `Call ${r.phone}`, url: `tel:${r.phone}` } : r.email ? { label: "Reply", url: `mailto:${r.email}` } : undefined,
    }),
  });
  return json({ ok: true });
});
