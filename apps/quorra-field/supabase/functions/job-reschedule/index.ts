// Moves a job. Signed-in team only (leave Verify JWT ON). Texts and emails the customer, and tells everyone on the account.
import { admin, accountOwner, handler, HttpError, json, requireUser } from "../_shared/util.ts";
import { sendEmail, sendSms } from "../_shared/notify.ts";
import { notifyAccount } from "../_shared/alert.ts";
import { normHours } from "../_shared/schedule.ts";

handler(async (req) => {
  if (req.method !== "POST") throw new HttpError(405, "POST only");
  const user = await requireUser(req);
  const b = await req.json().catch(() => null);
  const start = new Date(String(b?.start)), end = new Date(String(b?.end));
  if (!b?.job_id || isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) throw new HttpError(400, "Pick a valid start and end time");
  const db = admin();
  const owner = await accountOwner(user.id);
  const { data: job } = await db.from("jobs").select("id,title,customer_id,start_at,assigned_to").eq("id", b.job_id).eq("owner_id", owner).maybeSingle();
  if (!job) throw new HttpError(404, "Job not found");
  const { error } = await db.from("jobs").update({ start_at: start.toISOString(), end_at: end.toISOString(), reminder_sent_at: null, customer_reminded_at: null, team_reminded_at: null }).eq("id", job.id);
  if (error) throw error;
  const [{ data: biz }, { data: cust }, { data: me }] = await Promise.all([
    db.from("business").select("name,phone,hours").eq("owner_id", owner).maybeSingle(),
    db.from("customers").select("name,phone,email").eq("id", job.customer_id).maybeSingle(),
    db.from("team_members").select("name").eq("owner_id", owner).eq("email", user.email ?? "").maybeSingle(),
  ]);
  const tz = normHours(biz?.hours).tz;
  const f = (d: Date) => new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" }).format(d);
  const who = me?.name || user.email || "Someone";
  const first = (cust?.name ?? "").split(" ")[0] || "there";
  const msg = `Hi ${first}, your ${job.title} with ${biz?.name ?? "us"} has been rescheduled to ${f(start)}.${biz?.phone ? ` Questions? Call ${biz.phone}.` : ""}`;
  let texted = false;
  if (b.notify_customer !== false) {
    if (cust?.phone) texted = (await sendSms({ to: cust.phone, body: msg })).sent;
    if (cust?.email) await sendEmail({ to: cust.email, subject: `Your visit was rescheduled: ${f(start)}`, text: msg });
  }
  await notifyAccount(db, owner, { title: `Rescheduled: ${job.title}`, body: `${who} moved ${cust?.name ?? "a customer"}'s job from ${f(new Date(job.start_at))} to ${f(start)}.`, link: `/jobs/${job.id}` });
  return json({ ok: true, texted });
});
