// Emails a team invite. Signed-in owners/managers only (leave Verify JWT ON). Secrets: RESEND_API_KEY, FROM_EMAIL.
import { admin, accountOwner, handler, HttpError, json, requireUser } from "../_shared/util.ts";
import { sendEmail } from "../_shared/notify.ts";

handler(async (req) => {
  if (req.method !== "POST") throw new HttpError(405, "POST only");
  const user = await requireUser(req);
  const b = await req.json().catch(() => null);
  const code = typeof b?.code === "string" ? b.code : "";
  const link = typeof b?.link === "string" && b.link.startsWith("https://") ? b.link : "";
  if (!code || !link) throw new HttpError(400, "Missing invite");
  const db = admin();
  const owner = await accountOwner(user.id);
  const { data: inv } = await db.from("invites").select("email,role,status").eq("code", code).eq("owner_id", owner).maybeSingle();
  if (!inv || inv.status !== "pending") throw new HttpError(404, "Invite not found");
  const { data: biz } = await db.from("business").select("name,email").eq("owner_id", owner).maybeSingle();
  const name = biz?.name || "your team";
  const text = `You're invited to join ${name} on Quorra Dispatch as ${inv.role}.\n\nCreate your login with this email address (${inv.email}):\n${link}\n\nThe link works once.`;
  const r = await sendEmail({ to: inv.email, replyTo: biz?.email || undefined, subject: `Join ${name} on Quorra Dispatch`, text });
  return json({ ok: r.sent, reason: r.reason });
});
