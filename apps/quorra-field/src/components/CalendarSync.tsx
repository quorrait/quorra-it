import { useState } from "react";
import { useData } from "../lib/app";
import { hasSupabase, supabase } from "../lib/supabase";
import { feedUrl, webcalUrl } from "../lib/publicLinks";
import { buildIcs, downloadIcs } from "../lib/ics";
import { jobEvents } from "../lib/jobEvents";
import { useToast } from "./ui";

/** Phone calendar sync: a live subscription link on real accounts, a downloadable file in the demo. */
export default function CalendarSync({ memberId }: { memberId?: string }) {
  const { business, team, me, jobs, customerById, refresh } = useData();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  // Managers get the all-jobs feed; everyone else gets only their own jobs.
  const target = memberId ?? (me.role === "Owner" || me.role === "Manager" ? undefined : me.id ?? undefined);
  const member = target ? team.find((t) => t.id === target) : undefined;
  const token = member ? member.calendar_token : business.calendar_token;
  const label = member ? `${member.name}'s jobs` : "All jobs";
  const link = feedUrl(token);

  async function reset() {
    if (!supabase || !confirm("Create a new link? The current link will stop working on every phone that uses it.")) return;
    setBusy(true);
    const { error } = await supabase.rpc("reset_calendar_token", { p_member: member?.id ?? null });
    setBusy(false);
    if (error) return toast(error.message);
    await refresh();
    toast("New link created. Re-add it on the phone.");
  }

  const copy = async (text: string, msg: string) => { try { await navigator.clipboard.writeText(text); toast(msg); } catch { toast("Copy failed. Select the link and copy it manually."); } };

  if (!hasSupabase || !link) {
    const since = Date.now() - 30 * 86400_000;
    const mine = (member ? jobs.filter((j) => j.assigned_to === member.name) : jobs).filter((j) => new Date(j.start_at).getTime() >= since);
    return (
      <div className="stack">
        <p className="small muted">Live accounts get a private link that keeps the phone's calendar up to date automatically (Apple Calendar, Google Calendar, Outlook). In this demo you can download a calendar file with the current jobs.</p>
        <div><button className="btn primary" onClick={() => downloadIcs("jobs.ics", buildIcs(label, jobEvents(mine, customerById)))}>Download {label.toLowerCase()} (.ics)</button></div>
      </div>
    );
  }

  return (
    <div className="stack">
      <p className="small muted">{label}. Add this once on the phone and new, moved and cancelled jobs appear on their own (phones refresh subscribed calendars about every hour).</p>
      <div className="row wrap">
        <a className="btn primary" href={webcalUrl(token)}>Add to phone calendar</a>
        <button className="btn" onClick={() => copy(link, "Calendar link copied")}>Copy link</button>
        {member?.phone && <a className="btn" href={`sms:${member.phone}?&body=${encodeURIComponent(`Your job calendar: ${webcalUrl(token)}`)}`}>Text link</a>}
      </div>
      <input className="input" readOnly value={link} onFocus={(e) => e.currentTarget.select()} aria-label="Calendar link" />
      <details className="small">
        <summary className="bold">How to add it by hand</summary>
        <p><b>iPhone:</b> Settings, Calendar, Accounts, Add Account, Other, Add Subscribed Calendar, paste the link.</p>
        <p><b>Android / Google Calendar:</b> on a computer open calendar.google.com, Other calendars (+), From URL, paste the link. It then shows on the phone.</p>
        <p><b>Outlook:</b> Add calendar, Subscribe from web, paste the link.</p>
      </details>
      <div><button className="btn sm danger" disabled={busy} onClick={reset}>Reset link</button></div>
    </div>
  );
}
