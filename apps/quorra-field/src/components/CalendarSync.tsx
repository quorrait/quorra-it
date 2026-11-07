import { useConfirm } from "./ui";
import { useState } from "react";
import { useData } from "../lib/app";
import { hasSupabase, supabase } from "../lib/supabase";
import { feedUrl } from "../lib/publicLinks";
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
      <div className="small"><b>iPhone:</b> Settings, Calendar, Accounts, Add Account, Other, Add Subscribed Calendar, paste the link.</div>
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

  return (
    <div className="stack">
      <p className="small muted" style={{ margin: 0 }}>Calendar: <b>{label}</b></p>
      {how}
      <div className="opt-group">
        <h4>Step 1: copy your calendar link</h4>
        <button className="btn primary" style={{ minHeight: 48 }} onClick={() => copy(link, "Calendar link copied")}>Copy calendar link</button>
        <input className="input" readOnly value={link} onFocus={(e) => e.currentTarget.select()} aria-label="Calendar link" />
      </div>
      <div className="opt-group">
        <h4>Step 2 on iPhone or iPad (Apple Calendar)</h4>
        <ol className="small" style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 4 }}>
          <li>Open <b>Settings</b>, then <b>Calendar</b>, then <b>Accounts</b>.</li>
          <li>Tap <b>Add Account</b>, then <b>Other</b>, then <b>Add Subscribed Calendar</b>.</li>
          <li>Paste the link into <b>Server</b> and tap <b>Next</b>, then <b>Save</b>.</li>
        </ol>
        <div className="small muted">Apple does not allow an app to add a calendar for you, so this one-time paste is the reliable way. After that it updates on its own.</div>
      </div>
      <div className="opt-group">
        <h4>Step 2 on Android or Google Calendar</h4>
        <ol className="small" style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 4 }}>
          <li>In a browser (Chrome) open <b>calendar.google.com</b> and choose <b>Desktop site</b> from the browser menu.</li>
          <li>Next to <b>Other calendars</b> tap <b>+</b>, then <b>From URL</b>.</li>
          <li>Paste the link and tap <b>Add calendar</b>.</li>
        </ol>
        <div className="small muted">Google's phone app cannot add a calendar from a link. Once added on the website it shows in the Google Calendar app on every phone signed in to that account. Google refreshes on its own schedule, which can take hours.</div>
      </div>
      <details className="small">
        <summary className="bold">Outlook and sharing</summary>
        <div className="stack" style={{ marginTop: 8 }}>
          <div className="row wrap">
            {member?.phone && <a className="btn" href={`sms:${member.phone}?&body=${encodeURIComponent(`Your job calendar (updates automatically). Add it as a subscribed calendar: ${link}`)}`}>Text link</a>}
          </div>
          <div><b>Outlook:</b> Add calendar, Subscribe from web, paste the link.</div>
        </div>
      </details>
      <div className="small muted">Anyone with this link can see these jobs, so keep it private. If it gets shared by mistake, reset it and add the new link on the phone.</div>
      <div><button className="btn sm danger" disabled={busy} onClick={reset}>Reset link</button></div>
    </div>
  );
}
