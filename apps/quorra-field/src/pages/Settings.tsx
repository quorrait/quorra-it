import LeadFormCard from "../components/LeadFormCard";
import { STATE_NAMES } from "../lib/priceGuide";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth, useData } from "../lib/app";
import { Field, Icon, Sheet, Spinner, useToast } from "../components/ui";
import CalendarSync from "../components/CalendarSync";
import { leadFormUrl } from "../lib/publicLinks";
import { APP_NAME } from "../lib/config";

export function More() {
  const { email, signOut } = useAuth();
  const { can, me, viewAs, team, store } = useData();
  return (
    <div className="stack">
      <h1 className="page-title">More</h1>
      <div className="card flush">
        <div className="list">
          {can("leads") && <Link to="/leads" className="list-item">{Icon.users}<div className="grow title">Leads</div>›</Link>}
          {can("estimates") && <Link to="/estimates" className="list-item">{Icon.invoice}<div className="grow title">Estimates</div>›</Link>}
          {can("pricebook") && <Link to="/pricebook" className="list-item">{Icon.card}<div className="grow title">Price book</div>›</Link>}
          {can("templates") && <Link to="/templates" className="list-item">{Icon.invoice}<div className="grow title">Templates</div>›</Link>}
          {can("plans") && <Link to="/plans" className="list-item">{Icon.cal}<div className="grow title">Service plans</div>›</Link>}
          {can("purchase_orders") && <Link to="/purchase-orders" className="list-item">{Icon.jobs}<div className="grow title">Purchase orders</div>›</Link>}
          {can("customers") && <Link to="/customers" className="list-item">{Icon.users}<div className="grow title">Customers</div>›</Link>}
          {can("team") && <Link to="/team" className="list-item">{Icon.users}<div className="grow title">Team</div>›</Link>}
          {can("timesheets") && <Link to="/timesheets" className="list-item">{Icon.cal}<div className="grow title">Timesheets</div>›</Link>}
          {can("reports") && <Link to="/reports" className="list-item">{Icon.invoice}<div className="grow title">Reports</div>›</Link>}
          {can("import") && <Link to="/import" className="list-item">{Icon.send}<div className="grow title">Import</div>›</Link>}
          {can("settings") && <Link to="/settings" className="list-item">{Icon.gear}<div className="grow title">Settings & integrations</div>›</Link>}
        </div>
      </div>
      <div className="card stack">
        <div className="small muted">Signed in as {email} · {me.name} ({me.role})</div>
        {store.mode === "demo" && (
          <select className="select" value={me.id ?? ""} onChange={(e) => viewAs(e.target.value)} aria-label="View as">
            {team.filter((t) => t.active).map((t) => <option key={t.id} value={t.id}>Demo: view as {t.name} ({t.role})</option>)}
          </select>
        )}
        <button className="btn block" onClick={signOut}>Sign out</button>
      </div>
    </div>
  );
}

export default function Settings() {
  const { loading, store, business, refresh, resetDemo } = useData();
  const { signOut, email } = useAuth();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [f, setF] = useState({ name: "", phone: "", email: "", tax_rate: "0", state: "" });
  const [busy, setBusy] = useState<string | null>(null);
  const [demoForm, setDemoForm] = useState(false);


  async function uploadLogo(file: File) {
    const img = new Image();
    const url = URL.createObjectURL(file);
    await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error("Not an image")); img.src = url; }).catch(() => toast("Could not read that image"));
    const scale = Math.min(1, 400 / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(img.width * scale)); c.height = Math.max(1, Math.round(img.height * scale));
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    URL.revokeObjectURL(url);
    await run("logo", async () => { await store.saveBusiness({ logo: c.toDataURL("image/png") }); }, "Logo saved");
  }

  useEffect(() => {
    setF({ name: business.name, phone: business.phone, email: business.email, tax_rate: String(business.tax_rate), state: business.state ?? "" });
  }, [business]);

  useEffect(() => {
    const q = params.get("qbo");
    const s = params.get("stripe");
    if (q || s) {
      void refresh();
      toast(q === "connected" ? "QuickBooks connected" : q ? "QuickBooks connection failed" : s === "done" ? "Back from Stripe. If it still says not connected, give it a minute." : "Stripe setup not finished");
      setParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return <Spinner />;

  async function run(key: string, fn: () => Promise<void>, done?: string) {
    setBusy(key);
    try {
      await fn();
      await refresh();
      if (done) toast(done);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="stack">
      <h1 className="page-title">Settings</h1>

      <div className="card stack">
        <div className="card-title" style={{ margin: 0 }}>Business</div>
        <Field label="Logo (shows on printed estimates and invoices)">
          <div className="row">
            {business.logo && <img src={business.logo} alt="Logo" style={{ height: 48, maxWidth: 140, objectFit: "contain" }} />}
            <input type="file" accept="image/*" onChange={(e) => { const file = e.target.files?.[0]; if (file) void uploadLogo(file); }} />
            {business.logo && <button className="btn sm danger" onClick={() => run("logo", async () => { await store.saveBusiness({ logo: null }); }, "Logo removed")}>Remove</button>}
          </div>
        </Field>
        <Field label="Business name"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <div className="grid2 stack-sm">
          <Field label="Phone"><input className="input" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
          <Field label="Email"><input className="input" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        </div>
        <div className="grid2 stack-sm">
          <Field label="Default sales tax %"><input className="input" inputMode="decimal" value={f.tax_rate} onChange={(e) => setF({ ...f, tax_rate: e.target.value })} /></Field>
          <Field label="State you work in (for the price guide)">
            <select className="select" value={f.state} onChange={(e) => setF({ ...f, state: e.target.value })}>
              <option value="">Not set</option>
              {Object.entries(STATE_NAMES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
        </div>
        <button className="btn primary" disabled={busy === "save"} onClick={() => run("save", async () => { await store.saveBusiness({ name: f.name, phone: f.phone, email: f.email, tax_rate: parseFloat(f.tax_rate) || 0, state: f.state || null }); }, "Saved")}>Save</button>
      </div>

      <div className="card stack">
        <div className="card-title" style={{ margin: 0 }}>Phone calendar sync</div>
        <CalendarSync />
      </div>

      <LeadFormCard />

      <div className="card stack">
        <div className="row between">
          <div className="card-title" style={{ margin: 0 }}>Card payments (Stripe)</div>
          {business.stripe_connected ? <span className="badge good">Connected</span> : <span className="badge gray">Not connected</span>}
        </div>
        <p className="small muted">Customers pay by card or Apple/Google Pay, and the money goes straight to your own Stripe account.</p>
        {!business.stripe_connected && (
          <button className="btn dark" disabled={busy === "stripe"} onClick={() => run("stripe", () => store.stripeConnect())}>{Icon.card} Connect Stripe</button>
        )}
      </div>

      <div className="card stack">
        <div className="row between">
          <div className="card-title" style={{ margin: 0 }}>QuickBooks Online</div>
          {business.qbo_connected ? <span className="badge good">Connected</span> : <span className="badge gray">Not connected</span>}
        </div>
        {business.qbo_connected ? (
          <>
            <p className="small muted">Linked to <b>{business.qbo_company ?? "your company"}</b>. Open any sent invoice and tap "Sync to QuickBooks" to send it and its payments over.</p>
            <button className="btn danger" disabled={busy === "qbo"} onClick={() => run("qbo", () => store.qboDisconnect(), "QuickBooks disconnected")}>Disconnect</button>
          </>
        ) : (
          <>
            <p className="small muted">Send customers, invoices and payments to QuickBooks so your books stay current without double entry.</p>
            <button className="btn dark" disabled={busy === "qbo"} onClick={() => run("qbo", () => store.qboConnect(), "QuickBooks connected")}>Connect QuickBooks</button>
          </>
        )}
      </div>

      <div className="card stack">
        <div className="card-title" style={{ margin: 0 }}>Account</div>
        <div className="small muted">{APP_NAME} · signed in as {email}{store.mode === "demo" && " · demo mode"}</div>
        <div className="row wrap">
          <button className="btn grow" onClick={signOut}>Sign out</button>
          {store.mode === "demo" && <button className="btn danger grow" onClick={() => { if (confirm("Reset all demo data?")) resetDemo(); }}>Reset demo data</button>}
        </div>
      </div>
    </div>
  );
}
