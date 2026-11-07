// Run every hour. Texts and emails customers a reminder about visits in the next 24 hours, tells the company,
// and nudges customers whose service plan visit is due within 14 days.
// Protect it: set secret CRON_SECRET and send header "x-cron-secret". Deploy with --no-verify-jwt.
import { admin, handler, HttpError, json } from "../_shared/util.ts";
import { sendEmail, sendSms } from "../_shared/notify.ts";
import { normHours } from "../_shared/schedule.ts";

handler(async (req) => {
  const secret = Deno.env.get("CRON_SECRET");
  if (!secret || req.headers.get("x-cron-secret") !== secret) throw new HttpError(401, "Not allowed");
  const db = admin();
  const now = Date.now();
  let visits = 0, plans = 0;

  const { data: jobs } = await db.from("jobs").select("id,owner_id,customer_id,title,start_at,address,assigned_to")
    .eq("status", "scheduled").is("reminder_sent_at", null)
    .gt("start_at", new Date(now).toISOString()).lte("start_at", new Date(now + 24 * 3600_000).toISOString());
  for (const j of jobs ?? []) {
    const [{ data: biz }, { data: cust }] = await Promise.all([
      db.from("business").select("name,phone,email,hours").eq("owner_id", j.owner_id).maybeSingle(),
      db.from("customers").select("name,phone,email").eq("id", j.customer_id).maybeSingle(),
    ]);
    const tz = normHours(biz?.hours).tz;
    const when = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(j.start_at));
    const first = (cust?.name ?? "").split(" ")[0] || "there";
    const msg = `Reminder: ${biz?.name ?? "We"} will be at ${j.address || "your address"} for ${j.title} on ${when}.${biz?.phone ? ` Questions? Call ${biz.phone}.` : ""}`;
    if (cust?.phone) await sendSms({ to: cust.phone, body: `Hi ${first}. ${msg}` });
    if (cust?.email) await sendEmail({ to: cust.email, replyTo: biz?.email || undefined, subject: `Reminder: ${j.title} ${when}`, text: `Hi ${first},\n\n${msg}` });
    if (biz?.email) await sendEmail({ to: biz.email, subject: `Coming up: ${j.title} for ${cust?.name ?? "customer"}`, text: `${when}\n${cust?.name ?? ""} ${cust?.phone ?? ""}\n${j.address}${j.assigned_to ? `\nAssigned: ${j.assigned_to}` : ""}` });
    if (biz?.phone) await sendSms({ to: biz.phone, body: `Upcoming: ${j.title} for ${cust?.name ?? "customer"} ${when}` });
    await db.from("jobs").update({ reminder_sent_at: new Date().toISOString() }).eq("id", j.id);
    visits++;
  }

  const in14 = new Date(now + 14 * 86400_000).toISOString().slice(0, 10);
  const { data: sp } = await db.from("service_plans").select("id,owner_id,customer_id,name,visit_title,next_visit")
    .eq("status", "active").lte("next_visit", in14).or(`reminder_sent_at.is.null,reminder_sent_at.lt.${new Date(now - 60 * 86400_000).toISOString()}`);
  for (const p of sp ?? []) {
    const [{ data: biz }, { data: cust }] = await Promise.all([
      db.from("business").select("name,phone,email").eq("owner_id", p.owner_id).maybeSingle(),
      db.from("customers").select("name,phone,email").eq("id", p.customer_id).maybeSingle(),
    ]);
    const first = (cust?.name ?? "").split(" ")[0] || "there";
    const msg = `Your ${p.visit_title || p.name} with ${biz?.name ?? "us"} is due ${p.next_visit}. Call${biz?.phone ? ` ${biz.phone}` : " us"} to book a time.`;
    if (cust?.phone) await sendSms({ to: cust.phone, body: `Hi ${first}. ${msg}` });
    if (cust?.email) await sendEmail({ to: cust.email, replyTo: biz?.email || undefined, subject: `Service reminder: ${p.visit_title || p.name}`, text: `Hi ${first},\n\n${msg}` });
    if (biz?.email) await sendEmail({ to: biz.email, subject: `Service plan due: ${p.name} for ${cust?.name ?? "customer"}`, text: `${p.name} is due ${p.next_visit}. The customer was sent a reminder.` });
    await db.from("service_plans").update({ reminder_sent_at: new Date().toISOString() }).eq("id", p.id);
    plans++;
  }
  return json({ ok: true, visits, plans });
});
