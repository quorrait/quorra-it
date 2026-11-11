// A job was just saved with a new assignee. Tell that person's login, not the whole business.
import { admin, accountOwner, assertBilling, handler, HttpError, json, requireUser } from "../_shared/util.ts";
import { notifyAccount } from "../_shared/alert.ts";

handler(async (req) => {
  if (req.method !== "POST") throw new HttpError(405, "POST only");
  const user = await requireUser(req);
  const b = await req.json().catch(() => null);
  const jobId = typeof b?.job_id === "string" ? b.job_id : "";
  if (!jobId) throw new HttpError(400, "Missing job");
  const db = admin();
  const owner = await accountOwner(user.id);
  await assertBilling(owner);
  const { data: job } = await db.from("jobs").select("id,title,assigned_to,customer_id").eq("id", jobId).eq("owner_id", owner).maybeSingle();
  if (!job) throw new HttpError(404, "Job not found");
  const name = String(job.assigned_to ?? "").trim();
  if (!name) return json({ ok: true, skipped: true });
  const { data: members } = await db.from("team_members").select("id").eq("owner_id", owner).eq("name", name).limit(1);
  const member = members?.[0];
  if (!member) return json({ ok: true, skipped: true });
  const { data: login } = await db.from("account_members").select("user_id").eq("team_member_id", member.id).maybeSingle();
  if (!login?.user_id || login.user_id === user.id) return json({ ok: true, skipped: true });
  const { data: cust } = job.customer_id
    ? await db.from("customers").select("name").eq("id", job.customer_id).maybeSingle()
    : { data: null };
  await notifyAccount(db, owner, {
    title: `Job assigned: ${job.title}`,
    body: cust?.name ? `${cust.name} · assigned to you.` : "A job was assigned to you.",
    link: `/jobs/${job.id}`,
    userId: login.user_id as string,
  });
  return json({ ok: true });
});
