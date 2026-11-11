import { takeTourTab } from "../lib/tourBus";
import { useHubAdmin } from "../lib/hub";
import EmailTemplatesCard from "../components/EmailTemplatesCard";
import RoleAccessCard from "../components/RoleAccessCard";
import { STATE_TAX } from "../lib/stateTax";
import { errMsg } from "../lib/errors";
import LeadFormCard from "../components/LeadFormCard";
import { HoursCard, NotifyCard, VendorsCard } from "../components/BusinessSetupCards";
import InvoiceLayoutCard from "../components/InvoiceLayoutCard";
import InvoiceNumberCard from "../components/InvoiceNumberCard";
import { STATE_NAMES } from "../lib/priceGuide";
import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth, useData } from "../lib/app";
import { Field, Icon, Sheet, Spinner, useToast, useConfirm } from "../components/ui";
import { leadFormUrl } from "../lib/publicLinks";
import { APP_NAME } from "../lib/config";
import { PUBLIC_PRIVACY_URL, PUBLIC_SITE_URL } from "../lib/publicUrl";
import { hasSupabase, supabase } from "../lib/supabase";
import DeleteCompanySheet from "../components/DeleteCompanySheet";
import UpgradePrompt from "../components/UpgradePrompt";
import { SaveAllProvider, useRegisterSave } from "../lib/saveAll";

export function More() {
  const { email, signOut } = useAuth();
  const { can, allows, me, viewAs, team, store } = useData();
  const hubAdmin = useHubAdmin();
  return (
    <div className="stack">
      <h1 className="page-title">More</h1>
      {store.mode === "demo" && <a className="btn block" href={PUBLIC_SITE_URL}>‹ Back to website</a>}
      <div className="card flush">
        <div className="list">
          {can("leads") && <Link to="/leads" className="list-item">{Icon.users}<div className="grow title">Leads</div>›</Link>}
          {can("estimates") && <Link to="/estimates" className="list-item">{Icon.invoice}<div className="grow title">Estimates</div>›</Link>}
          {can("pricebook") && <Link to="/pricebook" className="list-item">{Icon.card}<div className="grow title">Price book</div>›</Link>}
          {can("templates") && <Link to="/templates" className="list-item">{Icon.invoice}<div className="grow title">Templates</div>›</Link>}
          {can("plans") && <Link to="/service-plans" className="list-item">{Icon.cal}<div className="grow title">Service plans</div>{!allows("service_plans") && Icon.lock}›</Link>}
          {can("purchase_orders") && <Link to="/purchase-orders" className="list-item">{Icon.jobs}<div className="grow title">Purchase orders</div>{!allows("purchase_orders") && Icon.lock}›</Link>}
          {can("customers") && <Link to="/customers" className="list-item">{Icon.users}<div className="grow title">Customers</div>›</Link>}
          {can("team") && <Link to="/team" className="list-item">{Icon.users}<div className="grow title">Team</div>›</Link>}
          {can("timesheets") && <Link to="/timesheets" className="list-item">{Icon.cal}<div className="grow title">Timesheets</div>{!allows("timesheets") && Icon.lock}›</Link>}
          {can("reports") && <Link to="/reports" className="list-item">{Icon.invoice}<div className="grow title">Reports</div>{!allows("reports") && Icon.lock}›</Link>}
          {can("import") && <Link to="/import" className="list-item">{Icon.send}<div className="grow title">Import</div>›</Link>}
          {can("settings") && <Link to="/settings" className="list-item">{Icon.gear}<div className="grow title">Settings</div>›</Link>}
          {can("settings") && <Link to="/integrations" className="list-item">{Icon.plug}<div className="grow title">Integrations</div>›</Link>}
          {can("billing") && <Link to="/billing" className="list-item">{Icon.card}<div className="grow title">Billing</div>›</Link>}
          <Link to="/support" className="list-item">{Icon.send}<div className="grow title">Support</div>›</Link>
          {hubAdmin && <Link to="/hub" className="list-item">{Icon.gear}<div className="grow title">Hub</div>›</Link>}
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
  const { loading, store, business, refresh, resetDemo, me, allows } = useData();
  const { signOut, email } = useAuth();
  const [delOpen, setDelOpen] = useState(false);
  const toast = useToast();
  const ask = useConfirm();
  const [params, setParams] = useSearchParams();
  const [f, setF] = useState({ name: "", phone: "", email: "", tax_rate: "0", text_number: "", state: "", address: "", review_url: "", yelp_url: "" });
  const [busy, setBusy] = useState<string | null>(null);
  const [demoForm, setDemoForm] = useState(false);
  type SettingsTab = "business" | "documents" | "emails" | "schedule" | "access" | "account";
  const [tab, setTab] = useState<SettingsTab>((takeTourTab() as SettingsTab | null) ?? "business");
  useEffect(() => {
    const on = (e: Event) => { const t = (e as CustomEvent<string | null>).detail; if (t) setTab(t as SettingsTab); };
    window.addEventListener("qd-settings-tab", on);
    return () => window.removeEventListener("qd-settings-tab", on);
  }, []);
  const nav = useNavigate();


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
    setF({ name: business.name, phone: business.phone, email: business.email, tax_rate: String(business.tax_rate), text_number: business.text_number ?? "", state: business.state ?? "", address: business.address ?? "", review_url: business.review_url ?? "", yelp_url: business.yelp_url ?? "" });
    // Only when the saved values really change. The background refresh hands over a fresh object every few seconds,
    // and resetting on that would wipe what is being typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [business.name, business.phone, business.email, business.tax_rate, business.text_number, business.state, business.address, business.review_url, business.yelp_url]);

  useEffect(() => {
    const q = params.get("qbo");
    const s = params.get("stripe");
    if (q || s) {
      void refresh();
      toast(q === "connected" ? "QuickBooks connected" : q === "plan" ? "QuickBooks is on the Enterprise plan." : q ? "QuickBooks connection failed" : s === "done" ? "Back from Stripe. If it still says not connected, give it a minute." : "Stripe setup not finished");
      setParams({}, { replace: true });
      nav("/integrations", { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const bizDirty = f.name !== business.name || f.phone !== business.phone || f.email !== business.email || (parseFloat(f.tax_rate) || 0) !== business.tax_rate || f.text_number.trim() !== (business.text_number ?? "") || (f.state || "") !== (business.state ?? "") || f.address !== (business.address ?? "") || f.review_url.trim() !== (business.review_url ?? "") || f.yelp_url.trim() !== (business.yelp_url ?? "");
  useRegisterSave("business", !loading && bizDirty, () => run("save", async () => { await store.saveBusiness({ name: f.name, phone: f.phone, email: f.email, tax_rate: parseFloat(f.tax_rate) || 0, state: f.state || null, text_number: f.text_number.trim(), address: f.address, review_url: f.review_url.trim(), yelp_url: f.yelp_url.trim() }); }, "Business details saved"));

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
      <div className="chips" style={{ flexWrap: "wrap" }}>
        {([["business", "Business"], ["documents", "Documents"], ["emails", "Emails"], ["schedule", "Schedule and alerts"], ...(hasSupabase && me.isOwner ? [["access", "Access"]] : []), ["account", "Account"]] as [typeof tab, string][]).map(([k, l]) => (
          <button key={k} className={`chip${tab === k ? " on" : ""}`} style={{ minHeight: 40 }} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      {tab === "business" && <div className="card stack">
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
          <Field label="Business number"><input className="input" type="tel" value={f.text_number} onChange={(e) => setF({ ...f, text_number: e.target.value })} placeholder="(916) 555-0100" />
            <div className="small muted" style={{ marginTop: 4 }}>The number you text customers from. It shows on the send screen. Sending from it automatically comes later.</div></Field>
          <Field label="Default sales tax %">
            <input className="input" inputMode="decimal" value={f.tax_rate} onChange={(e) => setF({ ...f, tax_rate: e.target.value })} />
            {!(parseFloat(f.tax_rate) > 0) && STATE_TAX[f.state] !== undefined && <div className="small muted" style={{ marginTop: 4 }}>Left at 0, new estimates and invoices use your state's base rate of {STATE_TAX[f.state]}%. Enter your full local rate to override it.</div>}
          </Field>
          <Field label="State you work in (for the price guide)">
            <select className="select" value={f.state} onChange={(e) => { const ns = e.target.value; const cur = parseFloat(f.tax_rate) || 0; const auto = !(cur > 0) || cur === (STATE_TAX[f.state] ?? -1); setF({ ...f, state: ns, tax_rate: auto && STATE_TAX[ns] !== undefined ? String(STATE_TAX[ns]) : f.tax_rate }); }}>
              <option value="">Not set</option>
              {Object.entries(STATE_NAMES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Google review link (for Ask for a review)"><input className="input" inputMode="url" value={f.review_url} onChange={(e) => setF({ ...f, review_url: e.target.value })} placeholder="https://g.page/r/your-business/review" /></Field>
        <div className="small muted" style={{ marginTop: -6 }}>In Google Business Profile, choose "Ask for reviews" and copy the link here.</div>
        <Field label="Yelp review link (optional)"><input className="input" inputMode="url" value={f.yelp_url} onChange={(e) => setF({ ...f, yelp_url: e.target.value })} placeholder="https://www.yelp.com/writeareview/biz/your-business" /></Field>
        <div className="small muted" style={{ marginTop: -6 }}>Open your Yelp business page and copy the "Write a review" link. Both links go out together when you ask for a review.</div>
      </div>}


      {tab === "schedule" && <>{allows("booking_rules") ? <HoursCard /> : <UpgradePrompt feature="booking_rules" title="Open hours and booking rules" />}<NotifyCard /></>}
      {tab === "emails" && <EmailTemplatesCard />}
      {tab === "documents" && <>{allows("custom_layout") ? <InvoiceLayoutCard /> : <UpgradePrompt feature="custom_layout" title="Invoice layout" />}<InvoiceNumberCard />{allows("purchase_orders") ? <VendorsCard /> : <UpgradePrompt feature="purchase_orders" title="Vendors" />}{allows("custom_layout") ? <LeadFormCard /> : <UpgradePrompt feature="custom_layout" title="Lead form design" />}</>}

      {tab === "access" && hasSupabase && me.isOwner && <RoleAccessCard />}

      {tab === "account" && <div className="card stack">
        <div className="card-title" style={{ margin: 0 }}>Account</div>
        <div className="small muted">{APP_NAME} · signed in as {email}{store.mode === "demo" && " · demo mode"}</div>
        <a className="small" href={PUBLIC_PRIVACY_URL} target="_blank" rel="noopener">Privacy policy</a>
        {hasSupabase && me.isOwner && <button className="btn block" onClick={async () => { const { data, error } = await supabase!.functions.invoke("send-test-email"); toast(error ? "Could not send. Deploy the send-test-email function." : data?.ok ? `Sample customer emails sent to ${data.to}` : data?.reason || "Could not send"); }}>Email me samples of customer emails</button>}
        <div className="row wrap">
          <button className="btn grow" onClick={signOut}>Sign out</button>
          {hasSupabase && me.isOwner && <button className="btn danger grow" onClick={() => setDelOpen(true)}>Delete my company</button>}
          {store.mode === "demo" && <button className="btn danger grow" onClick={async () => { if (await ask({ title: "Reset all demo data?", message: "Everything you added in the demo will be removed.", confirmLabel: "Reset", danger: true })) resetDemo(); }}>Reset demo data</button>}
        </div>
      </div>}
      {delOpen && <DeleteCompanySheet onClose={() => setDelOpen(false)} />}
    </div>
  );
}
