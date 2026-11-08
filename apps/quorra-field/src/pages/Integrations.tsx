import { useState, type ReactNode } from "react";
import { useData } from "../lib/app";
import { Icon, Sheet, useToast } from "../components/ui";
import CalendarSync from "../components/CalendarSync";
import { errMsg } from "../lib/errors";

interface Item { id: string; name: string; what: string; color: string; mark: string; live: boolean }

const ITEMS: Item[] = [
  { id: "stripe", name: "Stripe", what: "Take card and Apple Pay payments. Money goes straight to your bank.", color: "#635bff", mark: "S", live: true },
  { id: "qbo", name: "QuickBooks Online", what: "Send customers, invoices and payments to your books.", color: "#2ca01c", mark: "Qb", live: true },
  { id: "cal", name: "Phone calendar", what: "See your jobs in Apple, Google or Outlook calendar.", color: "#2563eb", mark: "31", live: true },
  { id: "xero", name: "Xero", what: "Accounting sync for Xero users.", color: "#13b5ea", mark: "X", live: false },
  { id: "zapier", name: "Zapier", what: "Connect Quorra Dispatch to thousands of other apps.", color: "#ff4a00", mark: "Z", live: false },
  { id: "gbp", name: "Google Business Profile", what: "Ask for reviews and answer them from the app.", color: "#4285f4", mark: "G", live: false },
  { id: "gusto", name: "Gusto", what: "Send timesheets to payroll.", color: "#f45d48", mark: "g", live: false },
  { id: "mailchimp", name: "Mailchimp", what: "Add customers to email campaigns.", color: "#f5b800", mark: "M", live: false },
  { id: "sheets", name: "Google Sheets", what: "Export customers, jobs and invoices automatically.", color: "#0f9d58", mark: "Sh", live: false },
  { id: "quo", name: "Quo", what: "Text customers from your Quo business number.", color: "#111827", mark: "Q", live: false },
];

/** Every app Quorra Dispatch connects to, as a grid. Tap a card to connect it. */
export default function Integrations() {
  const { business, store, refresh } = useData();
  const toast = useToast();
  const [open, setOpen] = useState<Item | null>(null);
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
      <p className="small muted">Linked to <b>{business.qbo_company ?? "your company"}</b>. Open any sent invoice and tap "Sync to QuickBooks" to send it and its payments over.</p>
      <button className="btn danger" disabled={busy === "qbo"} onClick={() => run("qbo", () => store.qboDisconnect(), "QuickBooks disconnected")}>Disconnect</button>
    </div>
  ) : (
    <div className="stack">
      <p className="small muted">Send customers, invoices and payments to QuickBooks so your books stay current without double entry.</p>
      <button className="btn dark" disabled={busy === "qbo"} onClick={() => run("qbo", () => store.qboConnect(), "QuickBooks connected")}>Connect QuickBooks</button>
    </div>
  );
  if (open?.id === "cal") body = <CalendarSync />;

  return (
    <div className="stack">
      <div className="page-head"><div><h1 className="page-title">Integrations</h1><p className="page-sub">Connect the apps you already use.</p></div></div>
      <div className="int-grid">
        {ITEMS.map((i) => (
          <button key={i.id} className="int-card" disabled={!i.live} onClick={() => i.live && setOpen(i)}>
            <span className="int-logo" style={{ background: i.color }}>{i.mark}</span>
            <span className="int-name">{i.name}</span>
            <span className="int-what">{i.what}</span>
            {i.live ? <span className={`badge ${connected(i.id) ? "good" : "blue"}`}>{connected(i.id) ? "Connected" : "Set up"}</span> : <span className="badge gray">Coming soon</span>}
          </button>
        ))}
      </div>
      <a className="btn block" href={`mailto:quorrait@gmail.com?subject=${encodeURIComponent("Integration request")}&body=${encodeURIComponent("Which app would you like Quorra Dispatch to connect to?\n\nApp name:\nWhat it should do:")}`}>Request another integration</a>
      {open && body && <Sheet title={open.name} onClose={() => setOpen(null)}>{body}</Sheet>}
    </div>
  );
}
