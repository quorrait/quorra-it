// Which times a customer can book: inside the business's open hours, not overlapping jobs already on the calendar.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

export interface DayHours { open: boolean; start: string; end: string }
export interface Hours { days?: DayHours[]; job_minutes?: number; buffer_minutes?: number; notice_hours?: number; max_days?: number; tz?: string }

export const normHours = (h: Hours | null | undefined) => ({
  days: h?.days?.length === 7 ? h.days : [0, 1, 2, 3, 4, 5, 6].map((d) => ({ open: d >= 1 && d <= 5, start: "08:00", end: "17:00" })),
  job_minutes: h?.job_minutes || 120,
  buffer_minutes: h?.buffer_minutes ?? 30,
  notice_hours: h?.notice_hours ?? 24,
  max_days: Math.min(h?.max_days || 30, 90),
  tz: h?.tz || "America/Los_Angeles",
});

function parts(ts: number, tz: string) {
  const f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric" });
  const o: Record<string, number> = {};
  for (const p of f.formatToParts(new Date(ts))) if (p.type !== "literal") o[p.type] = Number(p.value);
  return o;
}
const offsetMs = (ts: number, tz: string) => { const p = parts(ts, tz); return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - Math.floor(ts / 60000) * 60000; };
/** Wall-clock time in a time zone to a real moment. */
export function zonedToUtc(y: number, m: number, d: number, h: number, min: number, tz: string): number {
  const guess = Date.UTC(y, m - 1, d, h, min);
  let t = guess - offsetMs(guess, tz);
  const o2 = offsetMs(t, tz);
  t = guess - o2;
  return t;
}
const mins = (s: string) => { const [h, m] = s.split(":").map(Number); return (h || 0) * 60 + (m || 0); };

/** Start times (ISO) a customer may pick. Pass excludeJobId when rescheduling so the job does not block itself. */
export async function availableSlots(db: SupabaseClient, ownerId: string, hoursRaw: Hours | null | undefined, excludeJobId?: string): Promise<{ slots: string[]; tz: string; job_minutes: number }> {
  const h = normHours(hoursRaw);
  const now = Date.now();
  const horizon = now + (h.max_days + 2) * 86400_000;
  const [{ data: jobs }, { data: techs }] = await Promise.all([
    db.from("jobs").select("id,start_at,end_at").eq("owner_id", ownerId).in("status", ["scheduled", "in_progress"]).gte("end_at", new Date(now - 86400_000).toISOString()).lte("start_at", new Date(horizon).toISOString()),
    db.from("team_members").select("id").eq("owner_id", ownerId).eq("active", true).eq("role", "Technician"),
  ]);
  const busy = (jobs ?? []).filter((j) => j.id !== excludeJobId).map((j) => [new Date(j.start_at).getTime(), new Date(j.end_at).getTime()] as const);
  const capacity = Math.max(1, (techs ?? []).length);
  const today = parts(now, h.tz);
  const out: string[] = [];
  for (let i = 0; i <= h.max_days; i++) {
    const day = new Date(Date.UTC(today.year, today.month - 1, today.day + i));
    const y = day.getUTCFullYear(), m = day.getUTCMonth() + 1, d = day.getUTCDate();
    const dh = h.days[day.getUTCDay()];
    if (!dh?.open) continue;
    const open = mins(dh.start), close = mins(dh.end);
    for (let t = open; t + h.job_minutes <= close; t += 30) {
      const s = zonedToUtc(y, m, d, Math.floor(t / 60), t % 60, h.tz);
      const e = s + h.job_minutes * 60000;
      if (s < now + h.notice_hours * 3600_000) continue;
      const lo = s - h.buffer_minutes * 60000, hi = e + h.buffer_minutes * 60000;
      if (busy.filter(([bs, be]) => bs < hi && be > lo).length >= capacity) continue;
      out.push(new Date(s).toISOString());
    }
  }
  return { slots: out, tz: h.tz, job_minutes: h.job_minutes };
}
