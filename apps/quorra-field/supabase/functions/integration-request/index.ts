// A signed-in owner asks for another integration; it is emailed to you. Leave Verify JWT ON.
import { admin, accountOwner, handler, HttpError, json, requireUser } from "../_shared/util.ts";
import { sendEmail } from "../_shared/notify.ts";
import { emailHtml } from "../_shared/emailTemplate.ts";
import { supportEmail } from "../_shared/publicUrl.ts";

const clean = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);

handler(async (req) => {
  if (req.method !== "POST") throw new HttpError(405, "POST only");
  const user = await requireUser(req);
  const owner = await accountOwner(user.id);
  const b = await req.json().catch(() => ({}));
  const app = clean(b.app, 120), what = clean(b.what, 2000);
  if (!app) throw new HttpError(400, "Tell us which app you want to connect.");
  const { data: biz } = await admin().from("business").select("name").eq("owner_id", owner).maybeSingle();
  const email = user.email ?? "";
  await sendEmail({
    to: supportEmail(), replyTo: email || undefined,
    subject: `Integration request: ${app}`,
    text: `App: ${app}\nFrom: ${biz?.name ?? ""} (${email})\n\n${what}`,
    html: emailHtml({ heading: `Integration request: ${app}`, rows: [{ label: "App", value: app }, { label: "Business", value: biz?.name || "-" }, { label: "Email", value: email || "-" }], paragraphs: what ? ["What it should do:", what] : [], button: email ? { label: "Reply", url: `mailto:${email}` } : undefined }),
  });
  return json({ ok: true });
});
