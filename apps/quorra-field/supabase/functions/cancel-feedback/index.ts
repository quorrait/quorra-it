// Saves why an owner is cancelling and emails it to you. Signed-in owners only (leave Verify JWT ON).
import { admin, accountOwner, handler, HttpError, json, requireUser } from "../_shared/util.ts";
import { sendEmail } from "../_shared/notify.ts";

const clean = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);

handler(async (req) => {
  if (req.method !== "POST") throw new HttpError(405, "POST only");
  const user = await requireUser(req);
  const owner = await accountOwner(user.id);
  if (owner !== user.id) throw new HttpError(403, "Only the account owner can cancel");
  const b = await req.json().catch(() => ({}));
  const reason = clean(b.reason, 120);
  if (!reason) throw new HttpError(400, "Please tell us why you are cancelling.");
  const db = admin();
  const { data: biz } = await db.from("business").select("name").eq("owner_id", owner).maybeSingle();
  const r = { owner_id: owner, email: user.email ?? "", business: biz?.name ?? "", reason, details: clean(b.details, 2000), contact_me: Boolean(b.contact_me), phone: clean(b.phone, 40) };
  await db.from("cancel_requests").insert(r);
  await sendEmail({
    to: Deno.env.get("CONTACT_TO") ?? "quorrait@gmail.com",
    subject: `${r.contact_me ? "[CONTACT ME] " : ""}Cancellation: ${r.business || r.email}`,
    text: `Business: ${r.business}\nEmail: ${r.email}\nPhone: ${r.phone}\nWants a call back: ${r.contact_me ? "YES" : "no"}\nReason: ${r.reason}\n\n${r.details}`,
  });
  return json({ ok: true });
});
