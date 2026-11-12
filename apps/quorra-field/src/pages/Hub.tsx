import { useEffect, useMemo, useState } from "react";
import { useToast } from "../components/ui";
import { errMsg } from "../lib/errors";
import { supabase } from "../lib/supabase";
import { useHubAdmin } from "../lib/hub";

interface Row { owner_id: string; name: string; login: string; phone: string; created_at: string | null; last_sign_in: string | null; plan: string; status: string; access?: string; comped: boolean; amount_cents: number; interval: string; period_end: string | null; canceling: boolean; team: number }
interface Ticket { id: string; business_name: string; user_email: string; category: string; subject: string; message: string; status: string; created_at: string }
const d = (s: string | null) => (s ? new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "-");
const money = (c: number) => `$${(c / 100).toFixed(0)}`;

async function call<T>(body: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error("Not connected");
  const { data, error } = await supabase.functions.invoke("hub", { body });
  if (error) { const ctx = (error as { context?: Response }).context; let m = error.message; try { const j = await ctx?.json(); if (j?.error) m = j.error; } catch { /* keep */ } throw new Error(m); }
  return data as T;
}

/** Quorra Dispatch Hub: every business, support requests, and sign in as. Platform admins only. */
export default function Hub() {
  const admin = useHubAdmin();
  const toast = useToast();
  const [tab, setTab] = useState<"biz" | "support">("biz");
  const [rows, setRows] = useState<Row[]>([]);
  const [tix, setTix] = useState<Ticket[]>([]);
  const [open, setOpen] = useState(0);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState("");
  const [link, setLink] = useState<{ name: string; url: string } | null>(null);

  async function load() {
    try {
      const o = await call<{ rows: Row[]; open_tickets: number }>({ action: "overview" }); setRows(o.rows); setOpen(o.open_tickets);
      const t = await call<{ tickets: Ticket[] }>({ action: "tickets" }); setTix(t.tickets);
    } catch (e) { toast(errMsg(e, "Could not load the Hub.")); }
  }
  useEffect(() => { if (admin) void load(); }, [admin]); // eslint-disable-line react-hooks/exhaustive-deps

  const list = useMemo(() => rows.filter((r) => !q || `${r.name} ${r.login} ${r.plan}`.toLowerCase().includes(q.toLowerCase())), [rows, q]);
  const stats = useMemo(() => ({ total: rows.length, active: rows.filter((r) => r.status === "active").length, comped: rows.filter((r) => r.comped).length, pastDue: rows.filter((r) => r.status === "past_due").length }), [rows]);

  async function signInAs(r: Row) {
    setBusy(r.owner_id);
    try {
      const back = `${location.origin}${import.meta.env.BASE_URL}`;
      const j = await call<{ link: string }>({ action: "impersonate", owner_id: r.owner_id, return_to: back });
      setLink({ name: r.name, url: j.link });
    } catch (e) { toast(errMsg(e, "Could not make the link.")); } finally { setBusy(""); }
  }
  async function setStatus(t: Ticket, status: string) {
    try { await call({ action: "ticket_update", id: t.id, status }); setTix(tix.map((x) => (x.id === t.id ? { ...x, status } : x))); setOpen(tix.filter((x) => (x.id === t.id ? status : x.status) === "open").length); }
    catch (e) { toast(errMsg(e, "Could not update.")); }
  }

  if (!admin) return <div className="stack"><h1>Hub</h1><div className="card muted">This page is for Quorra staff only.</div></div>;
  return (
    <div className="stack">
      <h1>Quorra Dispatch Hub</h1>
      <div className="grid2 stack-sm">
        <div className="card"><div className="small muted">Businesses</div><b style={{ fontSize: 24 }}>{stats.total}</b></div>
        <div className="card"><div className="small muted">Paying or trialing</div><b style={{ fontSize: 24 }}>{stats.active}</b></div>
        <div className="card"><div className="small muted">Free (comped)</div><b style={{ fontSize: 24 }}>{stats.comped}</b></div>
        <div className="card"><div className="small muted">Open support requests</div><b style={{ fontSize: 24 }}>{open}</b></div>
      </div>
      <div className="chips"><button className={`chip${tab === "biz" ? " on" : ""}`} onClick={() => setTab("biz")}>Businesses</button><button className={`chip${tab === "support" ? " on" : ""}`} onClick={() => setTab("support")}>Support{open ? ` (${open})` : ""}</button></div>

      {tab === "biz" && (<>
        <input className="input" placeholder="Search business, email or plan" value={q} onChange={(e) => setQ(e.target.value)} />
        {list.map((r) => (
          <div key={r.owner_id} className="card stack">
            <div className="row between wrap"><b>{r.name}</b><span className={`badge ${r.access === "grace" || r.access === "reviewer" || r.access === "closed" || r.status === "past_due" ? "bad" : r.status === "active" ? "good" : ""}`}>{r.comped ? "Free" : (r.access || r.status)}{r.canceling && r.access === "active, canceling" ? "" : r.canceling ? ", canceling" : ""}</span></div>
            <div className="small muted">{r.login} · {r.phone || "no phone"}</div>
            <div className="small">{r.plan}{r.comped ? "" : ` · ${money(r.amount_cents)}/${r.interval === "year" ? "yr" : "mo"}`} · {r.team} login{r.team === 1 ? "" : "s"} · joined {d(r.created_at)} · last seen {d(r.last_sign_in)}{r.period_end ? ` · renews ${d(r.period_end)}` : ""}</div>
            <div><button className="btn sm" disabled={busy === r.owner_id} onClick={() => void signInAs(r)}>{busy === r.owner_id ? "One moment..." : "Sign in as this user"}</button></div>
          </div>
        ))}
        {!list.length && <div className="card muted">No businesses found.</div>}
      </>)}

      {tab === "support" && (<>
        {tix.map((t) => (
          <div key={t.id} className="card stack">
            <div className="row between wrap"><b>{t.subject}</b><span className={`badge ${t.status === "open" ? "blue" : "good"}`}>{t.status}</span></div>
            <div className="small muted">{t.business_name} · {t.user_email} · {t.category} · {d(t.created_at)}</div>
            <div style={{ whiteSpace: "pre-wrap" }}>{t.message}</div>
            <div className="row wrap" style={{ gap: 8 }}>
              <a className="btn sm" href={`mailto:${t.user_email}?subject=${encodeURIComponent("Re: " + t.subject)}`}>Reply by email</a>
              <button className="btn sm" onClick={() => void setStatus(t, t.status === "open" ? "resolved" : "open")}>{t.status === "open" ? "Mark resolved" : "Reopen"}</button>
              {(() => { const r = rows.find((x) => x.login === t.user_email); return r ? <button className="btn sm" onClick={() => void signInAs(r)}>Sign in as them</button> : null; })()}
            </div>
          </div>
        ))}
        {!tix.length && <div className="card muted">No support requests yet.</div>}
      </>)}

      {link && (
        <div className="overlay" onClick={() => setLink(null)}>
          <div className="sheet stack" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-head"><h2>Sign in as {link.name}</h2></div>
            <p className="small muted" style={{ margin: 0 }}>This one-time link signs you in as the owner. Best: copy it and open it in a private window so your own login stays put. Opening it here replaces your login in this browser. If the owner is signed in on another device, they will be signed out. Every use is logged.</p>
            <button className="btn primary block" onClick={() => { void navigator.clipboard?.writeText(link.url); toast("Link copied. Paste it in a private window."); }}>Copy link</button>
            <a className="btn block" href={link.url}>Open here instead</a>
            <button className="btn block" onClick={() => setLink(null)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
