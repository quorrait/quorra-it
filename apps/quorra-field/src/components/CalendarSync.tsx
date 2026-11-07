import { useConfirm } from "./ui";
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
  const ask = useConfirm();
  const [busy, setBusy] = useState(false);

  // Managers get the all-jobs feed; everyone else gets only their own jobs.
  const target = memberId ?? (me.role === "Owner" || me.role === "Manager" ? undefined : me.id ?? undefined);
  const member = target ? team.find((t) => t.id === target) : undefined;
  const token = member ? member.calendar_token : business.calendar_token;
  const label = member ? `${member.name}'s jobs` : "All jobs";
  const link = feedUrl(token);

  async function reset() {
    if (!supabase) return;
    if (!(await ask({ title: "Create a new link?", message: "The current link will stop working on every phone that uses it.", confirmLabel: "Create new link", danger: true }))) return;
    setBusy(true);
    const { error } = await supabase.rpc("reset_calendar_token", { p_member: member?.id ?? null });
    setBusy(false);
    if (error) return toast(error.message);
    await refresh();
    toast("New link created. Re-add it on the phone.");
  }

  const copy = async (text: string, msg: string) => { try { await navigator.clipboard.writeText(text); toast(msg); } catch { toast("Copy failed. Select the link and copy it manually."); } };

  const steps = (
    <div className="stack" style={{ gap: 6 }}>
      <div className="bold small">How to connect your phone</div>
      <div className="small"><b>iPhone:</b> tap "Add to phone calendar" and then Subscribe. Or: Settings, Calendar, Accounts, Add Account, Other, Add Subscribed Calendar, paste the link.</div>
      <div className="small"><b>Android / Google Calendar:</b> on a computer open calendar.google.com, Other calendars (+), From URL, paste the link. It then shows on the phone's Google Calendar app.</div>
      <div className="small"><b>Outlook:</b> Add calendar, Subscribe from web, paste the link.</div>
    </div>
  );
  const how = (
    <div className="notice">
      <b>Always up to date.</b> This is a live subscription, not a file. Add it once and every new, moved or cancelled job updates on its own. Apple Calendar refreshes about every 15 minutes to an hour. Google Calendar decides its own schedule and can take several hours to a day.
    </div>
  );

  if (!hasSupabase || !link) {
    const since = Date.now() - 30 * 86400_000;
    const mine = (member ? jobs.filter((j) => j.assigned_to === member.name) : jobs).filter((j) => new Date(j.start_at).getTime() >= since);
    return (
      <div className="stack">
        {how}
        <div className="notice">Live accounts get a private calendar link for {label.toLowerCase()} with a one-tap "Add to phone calendar" button. The demo has no server, so the link is not available here.</div>
        {steps}
        <details className="small">
          <summary className="bold">Demo only: download a one-time copy</summary>
          <p>This file is a snapshot and will not update when jobs change.</p>
          <button className="btn sm" onClick={() => downloadIcs("jobs.ics", buildIcs(label, jobEvents(mine, customerById)))}>Download snapshot (.ics)</button>
        </details>
      </div>
    );
  }

  const google = `https://calendar.google.com/calendar/u/0/r?cid=${encodeURIComponent(feedUrl(token))}`;
  return (
    <div className="stack">
      <p className="small muted" style={{ margin: 0 }}>Calendar: <b>{label}</b></p>
      {how}
      <div className="opt-group">
        <h4>iPhone, iPad or Mac (Apple Calendar)</h4>
        <a className="btn primary" style={{ minHeight: 48 }} href="calshow://" onClick={() => { void navigator.clipboard?.writeText(link); toast("Link copied. Opening Calendar: add it as a subscribed calendar."); }}>Open Apple Calendar (copies link)</a>
        <a className="btn" href={webcalUrl(token)}>Subscribe directly (Safari)</a>
        <div className="small muted">Open this in Safari and tap Subscribe. If it says it cannot open the link (this can happen from the home-screen app), tap Copy link below, then go to Settings, Calendar, Accounts, Add Account, Other, Add Subscribed Calendar, and paste it.</div>
        <div><button className="btn" onClick={() => copy(link, "Calendar link copied")}>Copy link</button></div>
      </div>
      <div className="opt-group">
        <h4>Google Calendar (Android, or the Google app)</h4>
        <a className="btn primary" style={{ minHeight: 48 }} href={google} target="_blank" rel="noopener">Add to Google Calendar</a>
        <div className="small muted">Google does not let its phone app add a calendar from a link, so this opens calendar.google.com. Confirm the subscription there once. After that it appears in the Google Calendar app on every phone signed in to that Google account. On a phone you can also tap Copy link, open Google Calendar in a browser, choose Other calendars, From URL, and paste it.</div>
        <div><button className="btn" onClick={() => copy(link, "Calendar link copied")}>Copy link</button></div>
      </div>
      <details className="small">
        <summary className="bold">Other calendars or manual setup</summary>
        <div className="stack" style={{ marginTop: 8 }}>
          <div className="row wrap">
            <button className="btn" onClick={() => copy(link, "Calendar link copied")}>Copy link</button>
            {member?.phone && <a className="btn" href={`sms:${member.phone}?&body=${encodeURIComponent(`Your job calendar (updates automatically): ${webcalUrl(token)}`)}`}>Text link</a>}
          </div>
          <input className="input" readOnly value={link} onFocus={(e) => e.currentTarget.select()} aria-label="Calendar link" />
          <div><b>Outlook:</b> Add calendar, Subscribe from web, paste the link.</div>
        </div>
      </details>
      <div className="small muted">Anyone with this link can see these jobs, so keep it private. If it gets shared by mistake, reset it and add the new link on the phone.</div>
      <div><button className="btn sm danger" disabled={busy} onClick={reset}>Reset link</button></div>
    </div>
  );
}
