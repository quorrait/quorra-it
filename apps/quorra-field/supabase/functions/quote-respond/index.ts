// Public: the customer accepts or declines a quote, then picks a time from the open slots. Deploy with --no-verify-jwt.
// Accept -> quote approved. Schedule -> a job is put on the calendar and the customer gets a confirmation text with a reschedule link.
import { admin, handler, HttpError, json } from "../_shared/util.ts";
import { availableSlots, normHours } from "../_shared/schedule.ts";
import { sendEmail, sendSms } from "../_shared/notify.ts";
import { notifyAccount } from "../_shared/alert.ts";
import { emailHtml } from "../_shared/emailTemplate.ts";

handler(async (req) => {
  if (req.method !== "POST") throw new HttpError(405, "POST only");
  const b = await req.json().catch(() => null);
  const t = typeof b?.t === "string" ? b.t : "";
  const action = b?.action;
  if (t.length < 16 || !["accept", "decline", "schedule"].includes(action)) throw new HttpError(400, "Invalid request");

  const db = admin();
  const { data: est } = await db.from("estimates").select("*").eq("public_token", t).maybeSingle();
  if (!est) throw new HttpError(404, "This quote link is not valid");
  const { data: lead } = await db.from("leads").select("*").eq("estimate_id", est.id).eq("owner_id", est.owner_id).maybeSingle();

  if (action === "decline") {
    if (est.status === "approved" || est.status === "declined") return json({ ok: true, status: est.status });
    if (est.status !== "sent") throw new HttpError(409, "This quote is not ready yet");
    const reason = typeof b.reason === "string" ? b.reason.slice(0, 200) : "";
    await db.from("estimates").update({ status: "declined" }).eq("id", est.id);
    if (lead) await db.from("leads").update({ stage: "declined", notes: `${lead.notes ? lead.notes + "\n" : ""}Declined by customer${reason ? `: ${reason}` : ""}` }).eq("id", lead.id);
    return json({ ok: true, status: "declined" });
  }

  if (action === "accept") {
    if (est.status === "approved") return json({ ok: true, status: "approved" });
    if (est.status !== "sent") throw new HttpError(409, "This quote is not ready yet");
    await db.from("estimates").update({ status: "approved" }).eq("id", est.id);
    // The lead stays in the pipeline until a time is actually booked; then it becomes a work order.
    const back = typeof b.return_to === "string" && b.return_to.startsWith("https://") ? b.return_to.split("?")[0] : "";
    const quoteLink = back ? `${back}?t=${encodeURIComponent(t)}&api=${encodeURIComponent(typeof b.api === "string" ? b.api : "")}` : null;
    await db.from("estimates").update({ accepted_at: new Date().toISOString(), schedule_nudges: 0, quote_link: quoteLink }).eq("id", est.id); // needs SQL 0025
    const { data: c2 } = await db.from("customers").select("name").eq("id", est.customer_id).maybeSingle();
    await notifyAccount(db, est.owner_id, { title: `Quote accepted: ${est.title}`, body: `${c2?.name ?? "A customer"} accepted the quote. They have not picked a time yet; we will remind them.`, link: `/estimates/${est.id}` });
    return json({ ok: true, status: "approved" });
  }

  // schedule (or reschedule)
  if (est.status !== "approved") throw new HttpError(409, "Please accept the quote first");
  const startMs = new Date(String(b.start)).getTime();
  if (Number.isNaN(startMs)) throw new HttpError(400, "Please choose a time");
  const [{ data: biz }, { data: cust }, { data: oldJob }] = await Promise.all([
    db.from("business").select("name,phone,email,hours").eq("owner_id", est.owner_id).maybeSingle(),
    db.from("customers").select("name,phone,email,address").eq("id", est.customer_id).maybeSingle(),
    est.job_id ? db.from("jobs").select("id,status,start_at").eq("id", est.job_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  if (oldJob && oldJob.status !== "scheduled") throw new HttpError(409, "This visit can no longer be changed online. Please call us.");
  const hours = normHours(biz?.hours);
  if (oldJob && new Date(oldJob.start_at).getTime() - Date.now() < hours.notice_hours * 3600_000) throw new HttpError(409, `Visits can be changed online up to ${hours.notice_hours} hours ahead. Please call us.`);
  const { slots } = await availableSlots(db, est.owner_id, biz?.hours, oldJob?.id, est.duration_min);
  if (!slots.includes(new Date(startMs).toISOString())) throw new HttpError(409, "Sorry, that time was just taken. Please pick another.");
  const start = new Date(startMs), end = new Date(startMs + (est.duration_min > 0 ? est.duration_min : hours.job_minutes) * 60000);

  let jobId = oldJob?.id as string | undefined;
  if (jobId) {
    const { error } = await db.from("jobs").update({ start_at: start.toISOString(), end_at: end.toISOString(), customer_reminded_at: null, team_reminded_at: null }).eq("id", jobId);
    if (error) throw error;
  } else {
    const { data: job, error } = await db.from("jobs").insert({
      owner_id: est.owner_id, customer_id: est.customer_id, title: est.title, address: cust?.address ?? "",
      description: "Booked online by the customer after accepting the quote.", status: "scheduled", start_at: start.toISOString(), end_at: end.toISOString(),
    }).select("id").single();
    if (error) throw error;
    jobId = job.id as string;
    await db.from("estimates").update({ job_id: jobId }).eq("id", est.id);
    if (lead) await db.from("leads").update({ stage: "work_order", job_id: jobId }).eq("id", lead.id);
  }

  // Confirmation text (and email) with a link to change the time.
  const back = typeof b.return_to === "string" && b.return_to.startsWith("https://") ? b.return_to.split("?")[0] : "";
  const link = back ? `${back}?t=${encodeURIComponent(t)}&api=${encodeURIComponent(typeof b.api === "string" ? b.api : "")}` : "";
  const when = new Intl.DateTimeFormat("en-US", { timeZone: hours.tz, weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" }).format(start);
  const first = (cust?.name ?? "").split(" ")[0] || "there";
  const msg = `Hi ${first}, your ${est.title} with ${biz?.name ?? "us"} is scheduled for ${when}.${link ? ` Need to change it? Reschedule here: ${link}` : ""}`;
  const texted = cust?.phone ? await sendSms({ to: cust.phone, body: msg }) : { sent: false, reason: "No phone number" };
  if (cust?.email) await sendEmail({ to: cust.email, replyTo: biz?.email || undefined, subject: `Your visit is scheduled: ${when}`, text: msg,
    html: emailHtml({ brand: biz?.name || "Your contractor", heading: oldJob ? "Your visit was rescheduled" : "You're on the schedule", paragraphs: [`Hi ${first}, your ${est.title} is booked.`],
      rows: [{ label: "When", value: when }, ...(cust?.address ? [{ label: "Where", value: cust.address }] : []), ...(biz?.phone ? [{ label: "Questions?", value: biz.phone }] : [])],
      button: link ? { label: "Change my time", url: link } : undefined, fine: "You will get a reminder before your visit." }) });
  await notifyAccount(db, est.owner_id, { title: `${oldJob ? "Rescheduled" : "Booked"}: ${est.title} for ${cust?.name ?? "customer"}`, body: `${cust?.name ?? "A customer"} ${oldJob ? "moved their visit to" : "booked"} ${when}.`, link: `/jobs/${jobId}` });
  return json({ ok: true, status: "approved", scheduled_for: start.toISOString(), texted: texted.sent });
});
