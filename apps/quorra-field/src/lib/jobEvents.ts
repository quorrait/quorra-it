import type { Customer, Job } from "./types";
import type { CalEvent } from "./ics";

export function jobEvents(jobs: Job[], customerById: (id: string) => Customer | undefined): CalEvent[] {
  return jobs.map((j) => {
    const c = customerById(j.customer_id);
    return {
      uid: `${j.id}@quorra-dispatch`,
      title: `${j.title}${c ? ` - ${c.name}` : ""}`,
      start: j.start_at, end: j.end_at, location: j.address,
      description: [c ? `Customer: ${c.name}` : "", c?.phone ? `Phone: ${c.phone}` : "", j.assigned_to ? `Assigned to: ${j.assigned_to}` : "", j.description].filter(Boolean).join("\n"),
      cancelled: j.status === "canceled",
    };
  });
}
