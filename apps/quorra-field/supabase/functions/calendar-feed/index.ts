// Subscribable calendar feed (iCalendar). Deploy with --no-verify-jwt: phones fetch it without logging in.
// The unguessable token in the URL is the credential. A business token returns every job; a team member's token
// returns only the jobs assigned to that person. Tokens can be reset in the app.
import { admin, billingActive } from "../_shared/util.ts";
import { buildIcs, type CalEvent } from "../_shared/ics.ts";

Deno.serve(async (req) => {
  const t = new URL(req.url).searchParams.get("t") ?? "";
  const plain = (status: number, body: string) => new Response(body, { status, headers: { "Content-Type": "text/plain" } });
  if (t.length < 16) return plain(400, "Invalid calendar link");

  const db = admin();
  let ownerId: string | null = null;
  let memberName: string | null = null;
  let calName = "Jobs";

  const { data: biz } = await db.from("business").select("owner_id,name").eq("calendar_token", t).maybeSingle();
  if (biz) { ownerId = biz.owner_id; calName = `${biz.name} - All jobs`; }
  else {
    const { data: m } = await db.from("team_members").select("owner_id,name").eq("calendar_token", t).maybeSingle();
    if (m) {
      ownerId = m.owner_id; memberName = m.name;
      const { data: b } = await db.from("business").select("name").eq("owner_id", m.owner_id).maybeSingle();
      calName = `${b?.name ?? "Jobs"} - ${m.name}`;
    }
  }
  if (!ownerId) return plain(404, "This calendar link is not valid. Ask for a new one.");
  if (!(await billingActive(ownerId))) {
    return new Response(buildIcs(calName, []), { headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "private, max-age=300" } });
  }

  const from = new Date(Date.now() - 45 * 86400_000).toISOString();
  const to = new Date(Date.now() + 400 * 86400_000).toISOString();
  let q = db.from("jobs").select("id,title,description,address,status,start_at,end_at,customer_id,assigned_to")
    .eq("owner_id", ownerId).gte("start_at", from).lte("start_at", to).order("start_at");
  if (memberName) q = q.eq("assigned_to", memberName);
  const { data: jobs, error } = await q;
  if (error) return plain(500, "Could not load jobs");

  const ids = [...new Set((jobs ?? []).map((j) => j.customer_id))];
  const { data: custs } = ids.length
    ? await db.from("customers").select("id,name,phone").in("id", ids)
    : { data: [] as { id: string; name: string; phone: string }[] };
  const byId = new Map((custs ?? []).map((c) => [c.id, c]));

  const events: CalEvent[] = (jobs ?? []).map((j) => {
    const c = byId.get(j.customer_id);
    return {
      uid: `${j.id}@quorra-dispatch`,
      title: `${j.title}${c ? ` - ${c.name}` : ""}`,
      start: j.start_at, end: j.end_at, location: j.address ?? "",
      description: [c ? `Customer: ${c.name}` : "", c?.phone ? `Phone: ${c.phone}` : "", j.assigned_to ? `Assigned to: ${j.assigned_to}` : "", j.description ?? ""].filter(Boolean).join("\n"),
      cancelled: j.status === "canceled",
    };
  });

  return new Response(buildIcs(calName, events), {
    headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "private, max-age=300" },
  });
});
