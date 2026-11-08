import { Link } from "react-router-dom";
import { useData } from "../lib/app";

interface Item { name: string; what: string; status: "connected" | "setup" | "soon"; to?: string; note?: string }

/** One place to see every app Quorra Dispatch connects to. Live ones link to their setup; the rest can be requested. */
export default function Integrations() {
  const { business } = useData();
  const items: Item[] = [
    { name: "Stripe payments", what: "Customers pay invoices by card. Money goes straight to your bank.", status: business.stripe_connected ? "connected" : "setup", to: "/settings" },
    { name: "QuickBooks Online", what: "Send invoices and payments to your books.", status: business.qbo_connected ? "connected" : "setup", to: "/settings" },
    { name: "Phone calendar", what: "Your jobs in Apple, Google or Outlook calendar.", status: "setup", to: "/settings" },
    { name: "Quo business texting", what: "Text customers from your Quo number.", status: business.text_number ? "connected" : "setup", to: "/settings", note: "Number saved. Sending from the app is coming." },
    { name: "Xero", what: "Accounting sync for Xero users.", status: "soon" },
    { name: "Zapier and webhooks", what: "Connect to thousands of other apps.", status: "soon" },
    { name: "Google Business Profile", what: "Ask for reviews and show them in the app.", status: "soon" },
    { name: "Gusto payroll", what: "Send timesheets to payroll.", status: "soon" },
    { name: "Mailchimp", what: "Add customers to email campaigns.", status: "soon" },
    { name: "Google Sheets", what: "Export customers, jobs and invoices automatically.", status: "soon" },
  ];
  const badge = (s: Item["status"]) => s === "connected" ? <span className="badge good">Connected</span> : s === "setup" ? <span className="badge blue">Set up</span> : <span className="badge gray">Coming soon</span>;
  return (
    <div className="stack">
      <div className="page-head"><div><h1 className="page-title">Integrations</h1><p className="page-sub">Connect the apps you already use.</p></div></div>
      <div className="card flush"><div className="list">
        {items.map((i) => (
          <div key={i.name} className="list-item">
            <div className="grow">
              <div className="title">{i.name} {badge(i.status)}</div>
              <div className="small muted">{i.what}{i.note && i.status === "connected" ? ` ${i.note}` : ""}</div>
            </div>
            {i.to ? <Link className="btn sm" to={i.to}>{i.status === "connected" ? "Manage" : "Set up"}</Link>
              : <a className="btn sm" href={`mailto:quorrait@gmail.com?subject=${encodeURIComponent("Integration request: " + i.name)}`}>Request</a>}
          </div>
        ))}
      </div></div>
    </div>
  );
}
