import { STATE_TAX } from "../lib/stateTax";
import { errMsg } from "../lib/errors";
import LeadFormCard from "../components/LeadFormCard";
import { HoursCard, NotifyCard, VendorsCard } from "../components/BusinessSetupCards";
import InvoiceLayoutCard from "../components/InvoiceLayoutCard";
import { STATE_NAMES } from "../lib/priceGuide";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth, useData } from "../lib/app";
import { Field, Icon, Sheet, Spinner, useToast, useConfirm } from "../components/ui";
import CalendarSync from "../components/CalendarSync";
import { leadFormUrl } from "../lib/publicLinks";
import { APP_NAME } from "../lib/config";
import { hasSupabase, supabase } from "../lib/supabase";
import { SaveAllProvider, useRegisterSave } from "../lib/saveAll";

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
          {can("billing") && <Link to="/billing" className="list-item">{Icon.card}<div className="grow title">Billing</div>›</Link>}
        </div>
      </div>
      <div className="card stack">
        <div><div className="bold">{me.name}</div><div className="small muted">{me.role} · {email}</div></div>
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
  return <SaveAllProvider><SettingsInner /></SaveAllProvider>;
}

function SettingsInner() {
  const { loading, store, business, refresh, resetDemo, me } = useData();
  const { signOut, email } = useAuth();
  const [delOpen, setDelOpen] = useState(false);
  const [delText, setDelText] = useState("");
  const [delBusy, setDelBusy] = useState(false);
  const toast = useToast();
  const ask = useConfirm();
  const [params, setParams] = useSearchParams();
  const [f, setF] = useState({ name: "", phone: "", email: "", tax_rate: "0", state: "", address: "", review_url: "", yelp_url: "" });
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
    setF({ name: business.name, phone: business.phone, email: business.email, tax_rate: String(business.tax_rate), state: business.state ?? "", address: business.address ?? "", review_url: business.review_url ?? "", yelp_url: business.yelp_url ?? "" });
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

  const bizDirty = f.name !== business.name || f.phone !== business.phone || f.email !== business.email || (parseFloat(f.tax_rate) || 0) !== business.tax_rate || (f.state || "") !== (business.state ?? "") || f.address !== (business.address ?? "") || f.review_url.trim() !== (business.review_url ?? "") || f.yelp_url.trim() !== (business.yelp_url ?? "");
  useRegisterSave("business", !loading && bizDirty, () => run("save", async () => { await store.saveBusiness({ name: f.name, phone: f.phone, email: f.email, tax_rate: parseFloat(f.tax_rate) || 0, state: f.state || null, address: f.address, review_url: f.review_url.trim(), yelp_url: f.yelp_url.trim() }); }, "Business details saved"));

  if (loading) return <Spinner />;

  async function run(key: string, fn: () => Promise<void>, done?: string) {
    setBusy(key);
    try {
      await fn();
      await refresh();
      if (done) toast(done);
    } catch (e) {
      toast(errMsg(e, "Something went wrong. Please try again."));
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
        <Field label="Business address (printed on invoices)"><textarea className="textarea" rows={2} value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} placeholder="123 Main St, Roseville, CA 95678" /></Field>
        <div className="grid2 stack-sm">
          <Field label="Default sales tax %">
            <input className="input" inputMode="decimal" value={f.tax_rate} onChange={(e) => setF({ ...f, tax_rate: e.target.value })} />
            {!(parseFloat(f.tax_rate) > 0) && STATE_TAX[f.state] !== undefined && <div className="small muted" style={{ marginTop: 4 }}>Left at 0, new estimates and invoices use your state's base rate of {STATE_TAX[f.state]}%. Enter your full local rate to override it.</div>}
          </Field>
          <Field label="State you work in (for the price guide)">
            <select className="select" value={f.state} onChange={(e) => setF({ ...f, state: e.target.value })}>
              <option value="">Not set</option>
              {Object.entries(STATE_NAMES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Google review link (for Ask for a review)"><input className="input" inputMode="url" value={f.review_url} onChange={(e) => setF({ ...f, review_url: e.target.value })} placeholder="https://g.page/r/your-business/review" /></Field>
        <div className="small muted" style={{ marginTop: -6 }}>In Google Business Profile, choose "Ask for reviews" and copy the link here.</div>
        <Field label="Yelp review link (optional)"><input className="input" inputMode="url" value={f.yelp_url} onChange={(e) => setF({ ...f, yelp_url: e.target.value })} placeholder="https://www.yelp.com/writeareview/biz/your-business" /></Field>
        <div className="small muted" style={{ marginTop: -6 }}>Open your Yelp business page and copy the "Write a review" link. Both links go out together when you ask for a review.</div>
      </div>


      <HoursCard />
      <NotifyCard />

      <VendorsCard />

      <InvoiceLayoutCard />

      <LeadFormCard />

      <details className="card fold">
        <summary><span className="card-title">Integrations</span><span className="small muted">Stripe, QuickBooks, phone calendar</span></summary>
        <div className="stack">
          <details className="sub">
            <summary><span className="bold">Card payments (Stripe)</span>{business.stripe_connected ? <span className="badge good">Connected</span> : <span className="badge gray">Not connected</span>}</summary>
            <div className="stack">
        <p className="small muted">Customers pay by card or Apple/Google Pay, and the money goes straight to your own Stripe account.</p>
        {!business.stripe_connected && (
          <button className="btn dark" disabled={busy === "stripe"} onClick={() => run("stripe", () => store.stripeConnect())}>{Icon.card} Connect Stripe</button>
        )}
            </div>
          </details>
          <details className="sub">
            <summary><span className="bold">QuickBooks Online</span>{business.qbo_connected ? <span className="badge good">Connected</span> : <span className="badge gray">Not connected</span>}</summary>
            <div className="stack">
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
          </details>
          <details className="sub">
            <summary><span className="bold">Phone calendar</span><span className="badge gray">Optional</span></summary>
            <div className="stack"><CalendarSync /></div>
          </details>
        </div>
      </details>

      <div className="card stack">
        <div className="card-title" style={{ margin: 0 }}>Account</div>
        <div className="small muted">{APP_NAME} · signed in as {email}{store.mode === "demo" && " · demo mode"}</div>
        <div className="row wrap">
          <button className="btn grow" onClick={signOut}>Sign out</button>
          {hasSupabase && me.isOwner && <button className="btn danger grow" onClick={() => setDelOpen(true)}>Delete my company</button>}
          {store.mode === "demo" && <button className="btn danger grow" onClick={async () => { if (await ask({ title: "Reset all demo data?", message: "Everything you added in the demo will be removed.", confirmLabel: "Reset", danger: true })) resetDemo(); }}>Reset demo data</button>}
        </div>
      </div>
      {delOpen && (
        <Sheet title="Delete your company" onClose={() => setDelOpen(false)}>
          <div className="stack">
            <div className="error-banner" style={{ margin: 0 }}>This permanently deletes your login, your company and everything in it: customers, jobs, estimates, invoices and team access. It also cancels your plan. It cannot be undone.</div>
            <Field label={`Type ${email ?? "your email"} to confirm`}><input className="input" value={delText} onChange={(e) => setDelText(e.target.value)} autoComplete="off" /></Field>
            <button className="btn danger block" disabled={delBusy || delText.trim().toLowerCase() !== (email ?? "").toLowerCase()} onClick={async () => {
              setDelBusy(true);
              try {
                const { error } = await supabase!.functions.invoke("delete-account", { body: { confirm: delText } });
                if (error) { let m = errMsg(error, "Could not delete"); try { const ctx = (error as { context?: Response }).context; if (ctx) m = (await ctx.json()).error ?? m; } catch { /* ignore */ } throw new Error(m); }
                await signOut(); location.reload();
              } catch (e) { toast(errMsg(e, "Could not delete")); setDelBusy(false); }
            }}>{delBusy ? "Deleting..." : "Delete everything"}</button>
          </div>
        </Sheet>
      )}
    </div>
  );
}
