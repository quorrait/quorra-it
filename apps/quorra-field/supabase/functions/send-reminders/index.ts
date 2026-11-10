// Run every hour. Texts and emails customers a reminder about visits in the next 24 hours, tells the company,
// and reminds customers whose service plan visit is due within 14 days.
// Protect it: set secret CRON_SECRET and send header "x-cron-secret". Deploy with --no-verify-jwt.
import { admin, handler, HttpError, json } from "../_shared/util.ts";
import { featureOn } from "../_shared/plan.ts";
import { sendEmail, sendSms } from "../_shared/notify.ts";
import { normHours } from "../_shared/schedule.ts";
import { emailHtml } from "../_shared/emailTemplate.ts";
import { fill, getTpl, getStyle } from "../_shared/templates.ts";

handler(async (req) => {
  const secret = Deno.env.get("CRON_SECRET");
  if (!secret || req.headers.get("x-cron-secret") !== secret) throw new HttpError(401, "Not allowed");
  const db = admin();
  const now = Date.now();
  let visits = 0, plans = 0;

  // Visits: each business chooses how long before a visit the customer and the team hear about it.
  const { data: jobs } = await db.from("jobs").select("id,owner_id,customer_id,title,start_at,address,assigned_to,customer_reminded_at,team_reminded_at")
    .eq("status", "scheduled").gt("start_at", new Date(now).toISOString()).lte("start_at", new Date(now + 8 * 86400_000).toISOString())
    .or("customer_reminded_at.is.null,team_reminded_at.is.null");
  const bizCache = new Map<string, Record<string, unknown> | null>();
  const remindersOn = new Map<string, boolean>();
  const allowsReminders = async (owner: string) => {
    if (!remindersOn.has(owner)) remindersOn.set(owner, await featureOn(owner, "reminders"));
    return remindersOn.get(owner) === true;
  };
  for (const j of jobs ?? []) {
    if (!(await allowsReminders(j.owner_id))) continue;
    if (!bizCache.has(j.owner_id)) {
      const { data } = await db.from("business").select("name,phone,email,hours,reminders,notify_email,notify_phone,email_templates").eq("owner_id", j.owner_id).maybeSingle();
      bizCache.set(j.owner_id, data);
    }
    const biz = bizCache.get(j.owner_id) as { name?: string; phone?: string; email?: string; hours?: never; reminders?: { customer_hours?: number; team_hours?: number }; notify_email?: string; notify_phone?: string } | null;
    const custH = biz?.reminders?.customer_hours ?? 24, teamH = biz?.reminders?.team_hours ?? 24;
    const startMs = new Date(j.start_at).getTime();
    const dueCust = custH > 0 && !j.customer_reminded_at && now >= startMs - custH * 3600_000;
    const dueTeam = teamH > 0 && !j.team_reminded_at && now >= startMs - teamH * 3600_000;
    if (!dueCust && !dueTeam) continue;
    const { data: cust } = await db.from("customers").select("name,phone,email").eq("id", j.customer_id).maybeSingle();
    const tz = normHours(biz?.hours).tz;
    const when = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(j.start_at));
    if (dueCust) {
      const first = (cust?.name ?? "").split(" ")[0] || "there";
      const msg = `Reminder: ${biz?.name ?? "We"} will be at ${j.address || "your address"} for ${j.title} on ${when}.${biz?.phone ? ` Questions? Call ${biz.phone}.` : ""}`;
      if (cust?.phone) await sendSms({ to: cust.phone, body: `Hi ${first}. ${msg}` });
      if (cust?.email) {
        const t = getTpl(biz?.email_templates, "reminder");
        const [dateStr, ...timeParts] = when.split(" at ");
        const vars = { customer: first, business: biz?.name ?? "us", service: j.title, date: dateStr, time: timeParts.join(" at ") || when, address: j.address || "", phone: biz?.phone ?? "", total: "" };
        await sendEmail({ to: cust.email, replyTo: biz?.email || undefined, fromName: biz?.name, subject: fill(t.subject, vars), text: fill(t.message, vars),
          html: emailHtml({ brand: biz?.name || "Your contractor", style: getStyle(biz?.email_templates), heading: fill(t.heading, vars), paragraphs: fill(t.message, vars).split(/\n{2,}/), rows: [{ label: "Service", value: j.title }, { label: "Appointment", value: when }, ...(j.address ? [{ label: "Location", value: j.address }] : [])] }) });
      }
      await db.from("jobs").update({ customer_reminded_at: new Date().toISOString() }).eq("id", j.id);
    }
    if (dueTeam) {
      const body = `${when}\n${cust?.name ?? ""} ${cust?.phone ?? ""}\n${j.address}${j.assigned_to ? `\nAssigned: ${j.assigned_to}` : ""}`;
      const { data: tech } = j.assigned_to ? await db.from("team_members").select("email,phone").eq("owner_id", j.owner_id).eq("name", j.assigned_to).maybeSingle() : { data: null };
      const mail = new Set([biz?.notify_email || biz?.email, tech?.email].filter(Boolean) as string[]);
      for (const to of mail) await sendEmail({ to, subject: `Coming up: ${j.title} for ${cust?.name ?? "customer"}`, text: body });
      for (const to of new Set([biz?.notify_phone, tech?.phone].filter(Boolean) as string[])) await sendSms({ to, body: `Upcoming: ${j.title} for ${cust?.name ?? "customer"} ${when}` });
      await db.from("jobs").update({ team_reminded_at: new Date().toISOString() }).eq("id", j.id);
    }
    visits++;
  }

  const in14 = new Date(now + 14 * 86400_000).toISOString().slice(0, 10);
  const { data: sp } = await db.from("service_plans").select("id,owner_id,customer_id,name,visit_title,next_visit")
    .eq("status", "active").lte("next_visit", in14).or(`reminder_sent_at.is.null,reminder_sent_at.lt.${new Date(now - 60 * 86400_000).toISOString()}`);
  for (const p of sp ?? []) {
    if (!(await allowsReminders(p.owner_id))) continue;
    const [{ data: biz }, { data: cust }] = await Promise.all([
      db.from("business").select("name,phone,email").eq("owner_id", p.owner_id).maybeSingle(),
      db.from("customers").select("name,phone,email").eq("id", p.customer_id).maybeSingle(),
    ]);
    const first = (cust?.name ?? "").split(" ")[0] || "there";
    const msg = `Your ${p.visit_title || p.name} with ${biz?.name ?? "us"} is due ${p.next_visit}. Call${biz?.phone ? ` ${biz.phone}` : " us"} to book a time.`;
    if (cust?.phone) await sendSms({ to: cust.phone, body: `Hi ${first}. ${msg}` });
    if (cust?.email) await sendEmail({ to: cust.email, replyTo: biz?.email || undefined, fromName: biz?.name, subject: `Service reminder: ${p.visit_title || p.name}`, text: `Hi ${first},\n\n${msg}` });
    if (biz?.email) await sendEmail({ to: biz.email, subject: `Service plan due: ${p.name} for ${cust?.name ?? "customer"}`, text: `${p.name} is due ${p.next_visit}. The customer was sent a reminder.` });
    await db.from("service_plans").update({ reminder_sent_at: new Date().toISOString() }).eq("id", p.id);
    plans++;
  }

  return json({ ok: true, visits, plans });
});
