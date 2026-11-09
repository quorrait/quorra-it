import { useEffect, useState, type ReactNode } from "react";
import { qboPending } from "../lib/qboSync";
import { useData } from "../lib/app";
import { Field, Icon, Sheet, useToast } from "../components/ui";
import { hasSupabase, supabase } from "../lib/supabase";
import CalendarSync from "../components/CalendarSync";
import { errMsg } from "../lib/errors";

interface Item { id: string; name: string; what: string; color: string; mark: string; live: boolean; slug?: string; cat: string }

const ITEMS: Item[] = [
  { id: "stripe", name: "Stripe", what: "Take card and Apple Pay payments. Money goes straight to your bank.", color: "#635bff", mark: "S", live: true, slug: "stripe", cat: "Payments" },
  { id: "qbo", name: "QuickBooks Online", what: "Send customers, invoices and payments to your books.", color: "#2ca01c", mark: "Qb", live: true, slug: "quickbooks", cat: "Accounting" },
  { id: "cal", name: "Phone calendar", what: "See your jobs in Apple, Google or Outlook calendar.", color: "#4285f4", mark: "31", live: true, slug: "googlecalendar", cat: "Scheduling" },
  { id: "xero", name: "Xero", what: "Accounting sync for Xero users.", color: "#13b5ea", mark: "X", live: false, slug: "xero", cat: "Accounting" },
  { id: "zapier", name: "Zapier", what: "Connect Quorra Dispatch to thousands of other apps.", color: "#ff4a00", mark: "Z", live: false, slug: "zapier", cat: "Automation" },
  { id: "gads", name: "Google Ads", what: "See which ads bring in leads and paid jobs.", color: "#4285f4", mark: "Ad", live: false, slug: "googleads", cat: "Marketing" },
  { id: "gbp", name: "Google Business Profile", what: "Ask for reviews and answer them from the app.", color: "#4285f4", mark: "G", live: false, slug: "google", cat: "Marketing" },
  { id: "gusto", name: "Gusto", what: "Send timesheets to payroll.", color: "#f45d48", mark: "g", live: false, slug: "gusto", cat: "Payroll" },
  { id: "mailchimp", name: "Mailchimp", what: "Add customers to email campaigns.", color: "#ffe01b", mark: "M", live: false, slug: "mailchimp", cat: "Marketing" },
  { id: "sheets", name: "Google Sheets", what: "Export customers, jobs and invoices automatically.", color: "#0f9d58", mark: "Sh", live: false, slug: "googlesheets", cat: "Reporting" },
  { id: "quo", name: "Quo", what: "Text customers from your Quo business number.", color: "#111827", mark: "Q", live: false, cat: "Texting" },
];

/** Every app Quorra Dispatch connects to, as a grid. Tap a card to connect it. */
export default function Integrations() {
  const { business, invoices, payments, store, refresh } = useData();
  const toast = useToast();
  const [open, setOpen] = useState<Item | null>(null);
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  async function run(key: string, fn: () => Promise<void>, done?: string) {
    setBusy(key);
    try { await fn(); await refresh(); if (done) toast(done); } catch (e) { toast(errMsg(e, "Something went wrong. Please try again.")); } finally { setBusy(null); }
  }
  const connected = (id: string) => (id === "stripe" ? business.stripe_connected : id === "qbo" ? business.qbo_connected : false);

  let body: ReactNode = null;
  if (open?.id === "stripe") body = (
    <div className="stack">
      <p className="small muted">Customers pay invoices by card or Apple and Google Pay, and the money goes straight to your own Stripe account.</p>
      {business.stripe_connected ? <div className="badge good" style={{ alignSelf: "flex-start" }}>Connected</div> : <button className="btn dark" disabled={busy === "stripe"} onClick={() => run("stripe", () => store.stripeConnect())}>{Icon.card} Connect Stripe</button>}
    </div>
  );
  if (open?.id === "qbo") body = business.qbo_connected ? (
    <div className="stack">
      <p className="small muted">Linked to <b>{business.qbo_company ?? "your company"}</b>. Sent and paid invoices, their customers and their payments go over automatically.</p>
      <div className="card stack" style={{ background: "#f8fafc" }}>
        <div className="bold">Sync everything now</div>
        <p className="small muted" style={{ margin: 0 }}>A backup. Sends every sent or paid invoice and any payments that have not reached QuickBooks yet.</p>
        <button className="btn" disabled={busy === "qbo-sync"} onClick={() => run("qbo-sync", async () => {
          const todo = qboPending(invoices, payments);
          if (!todo.length) { toast("Everything is already in QuickBooks"); return; }
          let ok = 0, bad = 0, why = "";
          for (const i of todo) { try { await store.qboSyncInvoice(i.id, { action: i.action, hash: i.hash }); ok++; } catch (e) { bad++; why = errMsg(e, ""); } }
          toast(bad ? `Synced ${ok}, ${bad} failed${why ? `: ${why}` : ""}` : `Synced ${ok} invoice${ok === 1 ? "" : "s"} to QuickBooks`);
        })}>{busy === "qbo-sync" ? "Syncing…" : "Sync everything"}</button>
      </div>
      <DepositCard />
      <div className="card stack" style={{ background: "#f8fafc" }}>
        <div className="bold">Bring in my QuickBooks history</div>
        <p className="small muted" style={{ margin: 0 }}>Customers, invoices and payments from the last 12 months, so your earnings numbers include them. It runs automatically when you first connect, and nothing in QuickBooks is changed.</p>
        <button className="btn" disabled={busy === "qbo-import"} onClick={() => run("qbo-import", async () => { const r = await store.qboImport(); toast(`Imported ${r.customers} customers, ${r.invoices} invoices, ${r.payments} payments`); })}>{busy === "qbo-import" ? "Importing…" : "Import now"}</button>
      </div>
      <button className="btn danger" disabled={busy === "qbo"} onClick={() => run("qbo", () => store.qboDisconnect(), "QuickBooks disconnected")}>Disconnect</button>
    </div>
  ) : (
    <div className="stack">
      <p className="small muted">Send customers, invoices and payments to QuickBooks so your books stay current without double entry.</p>
      <button className="btn dark" disabled={busy === "qbo"} onClick={() => run("qbo", () => store.qboConnect(), "QuickBooks connected")}>Connect QuickBooks</button>
    </div>
  );
  if (open?.id === "cal") body = <CalendarSync />;

  const live = ITEMS.filter((i) => i.live), soon = ITEMS.filter((i) => !i.live);
  const card = (i: Item) => (
    <button key={i.id} className={`int-card${i.live ? "" : " soon"}`} disabled={!i.live} onClick={() => i.live && setOpen(i)}>
      <span className="int-cat">{i.cat}</span>
      <span className="int-logo"><Logo item={i} /></span>
      <span className="int-name">{i.name}</span>
      <span className="int-what">{i.what}</span>
      {i.live ? <span className={`int-cta${connected(i.id) ? " on" : ""}`}>{connected(i.id) ? "Connected" : "Set up"}</span> : <span className="int-cta soon">Coming soon</span>}
    </button>
  );

  return (
    <div className="stack">
      <div className="page-head"><div><h1 className="page-title">Integrations</h1><p className="page-sub">Connect the apps you already use, so you enter things once.</p></div></div>
      <div className="int-section">Ready to connect</div>
      <div className="int-grid">{live.map(card)}</div>
      <div className="int-section">Coming soon</div>
      <div className="int-grid">{soon.map(card)}</div>
      <button className="btn block" style={{ minHeight: 48 }} onClick={() => setAsk(true)}>Request another integration</button>
      {open && body && <Sheet title={open.name} onClose={() => setOpen(null)}>{body}</Sheet>}
      {ask && <RequestSheet onClose={() => setAsk(false)} />}
    </div>
  );
}

function Logo({ item }: { item: Item }) {
  const [bad, setBad] = useState(!item.slug);
  if (bad) return <span style={{ color: item.color, fontWeight: 800, fontSize: 24 }}>{item.mark}</span>;
  return <img src={`https://cdn.simpleicons.org/${item.slug}`} alt={item.name} width={36} height={36} onError={() => setBad(true)} />;
}

function RequestSheet({ onClose }: { onClose(): void }) {
  const toast = useToast();
  const [app, setApp] = useState("");
  const [what, setWhat] = useState("");
  const [busy, setBusy] = useState(false);
  async function send() {
    if (!app.trim()) return toast("Tell us which app you want");
    setBusy(true);
    try {
      if (hasSupabase && supabase) {
        const { error } = await supabase.functions.invoke("integration-request", { body: { app: app.trim(), what: what.trim() } });
        if (error) throw error;
      }
      toast("Thanks. We got your request");
      onClose();
    } catch (e) { toast(errMsg(e, "Could not send. Please try again.")); } finally { setBusy(false); }
  }
  return (
    <Sheet title="Request an integration" onClose={onClose}>
      <div className="stack">
        <Field label="Which app?"><input className="input" value={app} onChange={(e) => setApp(e.target.value)} placeholder="For example, Jobber or Slack" /></Field>
        <Field label="What should it do?"><textarea className="textarea" rows={4} value={what} onChange={(e) => setWhat(e.target.value)} placeholder="Tell us how you would use it" /></Field>
        <button className="btn primary block" disabled={busy} onClick={() => void send()}>{busy ? "Sending..." : "Send request"}</button>
      </div>
    </Sheet>
  );
}

/** Picks the QuickBooks account that payments from the app are deposited into. */
function DepositCard() {
  const { business, store, refresh } = useData();
  const toast = useToast();
  const [accts, setAccts] = useState<{ id: string; name: string; type: string }[] | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { void store.qboAccounts().then(setAccts).catch(() => setAccts([])); }, [store]);
  async function pick(id: string) {
    const a = accts?.find((x) => x.id === id);
    setBusy(true);
    try { await store.saveBusiness({ qbo_deposit_account: a && a.type !== "undeposited" ? a.id : null, qbo_deposit_name: a && a.type !== "undeposited" ? a.name : null }); await refresh(); toast("Saved. New payments will go there"); }
    catch (e) { toast(errMsg(e, "Could not save. Run the latest database update first.")); } finally { setBusy(false); }
  }
  return (
    <div className="card stack" style={{ background: "#f8fafc" }}>
      <div className="bold">Deposit payments into</div>
      <p className="small muted" style={{ margin: 0 }}>Where QuickBooks records money from payments taken in the app. Pick your bank account to skip the matching step, or leave it on Undeposited Funds and match deposits yourself.</p>
      <select className="select" disabled={busy || !accts} value={business.qbo_deposit_account ?? accts?.find((a) => a.type === "undeposited")?.id ?? ""} onChange={(e) => void pick(e.target.value)}>
        {!accts && <option>Loading accounts…</option>}
        {accts?.length === 0 && <option value="">Undeposited Funds (default)</option>}
        {accts?.map((a) => <option key={a.id} value={a.id}>{a.name}{a.type === "undeposited" ? " (default)" : ""}</option>)}
      </select>
    </div>
  );
}
