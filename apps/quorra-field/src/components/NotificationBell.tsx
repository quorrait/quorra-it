import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { hasSupabase, supabase } from "../lib/supabase";
import { useData } from "../lib/app";

interface Note { id: string; title: string; body: string; link: string; created_at: string }
const SEEN = "qd-notif-seen";
const seenAt = () => { try { return localStorage.getItem(SEEN) ?? "1970-01-01"; } catch { return "1970-01-01"; } };

/** Bell with the account's notifications (bookings, reschedules). Polls every 30 seconds and shows a device alert if allowed. */
export default function NotificationBell() {
  const nav = useNavigate();
  const { me } = useData();
  const [list, setList] = useState<Note[]>([]);
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(seenAt());
  const known = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (!hasSupabase || !supabase) return;
    let live = true;
    const load = async () => {
      const { data, error } = await supabase!.from("notifications").select("*").order("created_at", { ascending: false }).limit(30);
      if (!live || error || !data) return;
      const rows = data as Note[];
      if (known.current && "Notification" in window && Notification.permission === "granted")
        rows.filter((n) => !known.current!.has(n.id)).forEach((n) => { try { new Notification(n.title, { body: n.body }); } catch { /* ignore */ } });
      known.current = new Set(rows.map((n) => n.id));
      setList(rows);
    };
    void load();
    const t = setInterval(() => void load(), 30000);
    const vis = () => { if (document.visibilityState === "visible") void load(); };
    document.addEventListener("visibilitychange", vis);
    return () => { live = false; clearInterval(t); document.removeEventListener("visibilitychange", vis); };
  }, [me.id]);

  if (!hasSupabase) return null;
  const unread = list.filter((n) => n.created_at > seen).length;
  const toggle = () => {
    setOpen(!open);
    if (!open && list[0]) { try { localStorage.setItem(SEEN, list[0].created_at); } catch { /* ignore */ } setTimeout(() => setSeen(list[0].created_at), 1500); }
  };
  const perm = "Notification" in window ? Notification.permission : "denied";
  return (
    <div className="bell-wrap">
      <button className="bell" onClick={toggle} aria-label={`Notifications${unread ? `, ${unread} new` : ""}`}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>
        {unread > 0 && <span className="bell-n">{unread}</span>}
      </button>
      {open && (
        <div className="bell-panel">
          <div className="row between" style={{ padding: "10px 12px" }}><b>Notifications</b><span className="row" style={{ gap: 6 }}>{list.length > 0 && <button className="btn sm" onClick={async () => { const ids = list.map((n) => n.id); setList([]); known.current = new Set(); const { error } = await supabase!.from("notifications").delete().in("id", ids); if (error) void (async () => { const { data } = await supabase!.from("notifications").select("*").order("created_at", { ascending: false }).limit(30); setList((data as Note[]) ?? []); })(); }}>Clear all</button>}<button className="btn sm" onClick={() => setOpen(false)}>Close</button></span></div>
          {perm === "default" && <div style={{ padding: "0 12px 8px" }}><button className="btn sm primary" onClick={() => void Notification.requestPermission().then(() => setOpen(false))}>Turn on device alerts</button></div>}
          {list.length === 0 && <div className="small muted" style={{ padding: 16 }}>Nothing yet. Bookings and reschedules show up here.</div>}
          {list.map((n) => (
            <div key={n.id} className="bell-item" onClick={() => { setOpen(false); if (n.link) nav(n.link); }}>
              <div className="bold small">{n.title}</div>
              <div className="small muted">{n.body}</div>
              <div className="small muted">{new Date(n.created_at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
