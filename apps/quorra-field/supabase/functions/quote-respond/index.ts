// Public: the customer accepts (and picks a preferred date) or declines a quote. Deploy with --no-verify-jwt.
// Accepting marks the quote approved, puts a job on the calendar, and moves the lead to "work_order".
import { admin, handler, HttpError, json } from "../_shared/util.ts";

const WINDOWS: Record<string, number> = { morning: 9, afternoon: 13 };

handler(async (req) => {
  if (req.method !== "POST") throw new HttpError(405, "POST only");
  const b = await req.json().catch(() => null);
  const t = typeof b?.t === "string" ? b.t : "";
  const action = b?.action;
  if (t.length < 16 || (action !== "accept" && action !== "decline")) throw new HttpError(400, "Invalid request");

  const db = admin();
  const { data: est } = await db.from("estimates").select("*").eq("public_token", t).maybeSingle();
  if (!est) throw new HttpError(404, "This quote link is not valid");
  if (est.status === "approved" || est.status === "declined") return json({ ok: true, status: est.status }); // already answered
  if (est.status !== "sent") throw new HttpError(409, "This quote is not ready yet");

  const { data: lead } = await db.from("leads").select("*").eq("estimate_id", est.id).eq("owner_id", est.owner_id).maybeSingle();

  if (action === "decline") {
    const reason = typeof b.reason === "string" ? b.reason.slice(0, 200) : "";
    await db.from("estimates").update({ status: "declined" }).eq("id", est.id);
    if (lead) await db.from("leads").update({ stage: "declined", notes: `${lead.notes ? lead.notes + "\n" : ""}Declined by customer${reason ? `: ${reason}` : ""}` }).eq("id", lead.id);
    return json({ ok: true, status: "declined" });
  }

  const date = typeof b.date === "string" ? b.date : "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) throw new HttpError(400, "Please choose a preferred date");
  const hour = WINDOWS[b.window] ?? 9;
  // The customer's browser sends its UTC offset in minutes (Date.getTimezoneOffset) so 9:00 means 9:00 their time.
  const offsetMin = Number.isFinite(b.tz) ? Math.max(-840, Math.min(840, Number(b.tz))) : 480;
  const start = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], hour, 0) + offsetMin * 60000);
  const now = Date.now();
  if (Number.isNaN(start.getTime()) || start.getTime() < now - 86400_000 || start.getTime() > now + 400 * 86400_000) throw new HttpError(400, "Please choose a date within the next year");

  const { data: cust } = await db.from("customers").select("address").eq("id", est.customer_id).maybeSingle();
  const { data: job, error } = await db.from("jobs").insert({
    owner_id: est.owner_id, customer_id: est.customer_id, title: est.title, address: cust?.address ?? "",
    description: `Accepted online. Customer's preferred ${b.window === "afternoon" ? "afternoon" : "morning"} arrival. Confirm the time with the customer.`,
    status: "scheduled", start_at: start.toISOString(), end_at: new Date(start.getTime() + 2 * 3600_000).toISOString(),
  }).select("id").single();
  if (error) throw error;

  await db.from("estimates").update({ status: "approved", job_id: job.id }).eq("id", est.id);
  if (lead) await db.from("leads").update({ stage: "work_order", job_id: job.id }).eq("id", lead.id);
  return json({ ok: true, status: "approved", scheduled_for: start.toISOString() });
});
