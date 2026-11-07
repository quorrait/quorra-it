import { errMsg } from "../lib/errors";
import { useMemo, useState } from "react";
import type { LeadFormSettings } from "../lib/types";
import { useData } from "../lib/app";
import { leadFormPreviewUrl, leadFormUrl } from "../lib/publicLinks";
import { Field, Sheet, useToast } from "./ui";
import ColorPick from "./ColorPick";
import { MAX_FORM_HTML, STARTER_FORM, downloadText } from "../lib/customHtml";

/** Website lead form: explains how it works, previews it, and gives the link and embed code. */
export default function LeadFormCard() {
  const { store, business, refresh } = useData();
  const toast = useToast();
  const [demoForm, setDemoForm] = useState(false);
  const live = leadFormUrl(business.lead_key, business.name);
  const [cfg, setCfg] = useState<LeadFormSettings>(business.lead_form ?? {});
  const [dirty, setDirty] = useState(false);
  const set = (p: Partial<LeadFormSettings>) => { setCfg((c) => ({ ...c, ...p })); setDirty(true); };
  const [servicesText, setServicesText] = useState((business.lead_form?.services ?? []).join("\n"));
  const previewSrc = useMemo(() => leadFormPreviewUrl(business.name, { ...cfg, services: servicesText.split("\n").map((x) => x.trim()).filter(Boolean) }), [business.name, cfg, servicesText]);
  async function save() {
    const services = servicesText.split("\n").map((x) => x.trim()).filter(Boolean);
    const next = { ...cfg, services: services.length ? services : undefined, custom_html: cfg.custom_html?.trim() ? cfg.custom_html : undefined };
    try { await store.saveBusiness({ lead_form: next }); await refresh(); setDirty(false); toast("Form saved. Your website form updates right away."); }
    catch (e) { toast(errMsg(e, "Could not save")); }
  }
  async function upload(f?: File) {
    if (!f) return;
    if (f.size > MAX_FORM_HTML) return toast(`That file is too big. Keep it under ${Math.round(MAX_FORM_HTML / 1000)} KB.`);
    set({ custom_html: await f.text() });
    toast("Form loaded. Check the preview, then Save form.");
  }
  const embed = `<iframe src="${live || "https://your-form-link"}" title="Request service" style="width:100%;max-width:600px;height:760px;border:0" loading="lazy"></iframe>`;
  const copy = async (text: string, msg: string) => { try { await navigator.clipboard.writeText(text); toast(msg); } catch { toast("Copy failed. Select the text and copy it manually."); } };

  return (
    <details className="card fold">
      <summary><span className="card-title">Website lead form</span></summary>
      <div className="stack">
      <p className="small muted">A ready-made request form for your website. When a customer fills it out, the request shows up under Leads as a new lead and you get a badge on the Leads tab.</p>

      <div className="stack" style={{ gap: 6 }}>
        <div className="bold small">How it works</div>
        <ol className="small" style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 4 }}>
          <li>Put the form on your website, or share its link in a text, email, Facebook page or Google Business profile.</li>
          <li>The customer enters their name, contact info and what they need.</li>
          <li>It lands in Leads as New. From there you move it to Contacted, then Send quote, and the rest follows.</li>
        </ol>
      </div>

      <div className="stack" style={{ gap: 8 }}>
        <div className="bold small">Edit your form</div>
        <Field label="Heading"><input className="input" value={cfg.heading ?? ""} placeholder="Request service" onChange={(e) => set({ heading: e.target.value })} /></Field>
        <Field label="Intro text"><textarea className="textarea" rows={2} value={cfg.intro ?? ""} placeholder="Tell us what you need and we will get back to you shortly." onChange={(e) => set({ intro: e.target.value })} /></Field>
        <div className="grid2 stack-sm">
          <Field label="Button text"><input className="input" value={cfg.button ?? ""} placeholder="Request service" onChange={(e) => set({ button: e.target.value })} /></Field>
          <Field label="Accent color"><ColorPick value={cfg.accent ?? "#ea580c"} onChange={(c) => set({ accent: c })} swatches={["#ea580c", "#0F2742", "#1D4ED8", "#047857"]} label="Accent color" /></Field>
        </div>
        <Field label="Thank-you message"><input className="input" value={cfg.thanks ?? ""} placeholder="Thank you. Your request was sent and we will contact you shortly." onChange={(e) => set({ thanks: e.target.value })} /></Field>
        <Field label="Service choices (one per line, leave empty for a free-text box)"><textarea className="textarea" rows={4} value={servicesText} placeholder={"AC repair\nFurnace repair\nNew install"} onChange={(e) => { setServicesText(e.target.value); setDirty(true); }} /></Field>
        <Field label="Extra question (optional)"><input className="input" value={cfg.extra_label ?? ""} placeholder="e.g. How did you hear about us?" onChange={(e) => set({ extra_label: e.target.value })} /></Field>
        <label className="row small"><input type="checkbox" checked={cfg.show_email !== false} onChange={(e) => set({ show_email: e.target.checked })} /> Ask for email</label>
        <label className="row small"><input type="checkbox" checked={cfg.show_address !== false} onChange={(e) => set({ show_address: e.target.checked })} /> Ask for service address</label>
        <label className="row small"><input type="checkbox" checked={Boolean(cfg.require_phone)} onChange={(e) => set({ require_phone: e.target.checked })} /> Require a phone number</label>
        <div className="feature">
          <div className="row between"><div className="feature-title">Use your own HTML form</div><span className="badge blue">{cfg.custom_html ? "In use" : "Upload yours"}</span></div>
          <div className="stack" style={{ marginTop: 10 }}>
            <p className="muted" style={{ margin: 0 }}>Upload your own form design as an HTML file, or paste it. It replaces the form above. Give the fields these names so requests land in Leads: <code>name</code>, <code>phone</code>, <code>email</code>, <code>address</code>, <code>service</code>, <code>message</code>. Any other field is added to the lead's notes. Your page runs in a sealed box, so it can't touch your account.</p>
            <div className="row wrap">
              <label className="btn">Upload .html<input type="file" accept=".html,.htm,text/html" hidden onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = ""; }} /></label>
              <button type="button" className="btn" onClick={() => downloadText("lead-form-starter.html", STARTER_FORM)}>Download a starter file</button>
              {cfg.custom_html && <button type="button" className="btn" onClick={() => set({ custom_html: "" })}>Go back to the built-in form</button>}
            </div>
            <textarea className="textarea" rows={6} value={cfg.custom_html ?? ""} maxLength={MAX_FORM_HTML} onChange={(e) => set({ custom_html: e.target.value })} placeholder="Or paste your HTML here" style={{ fontFamily: "monospace", fontSize: 12 }} />
          </div>
        </div>
        <div><button className="btn primary" disabled={!dirty} onClick={() => void save()}>Save form</button></div>
      </div>

      <div className="stack" style={{ gap: 6 }}>
        <div className="bold small">Preview</div>
        <iframe key={previewSrc} title="Lead form preview" src={previewSrc} style={{ width: "100%", height: 640, border: "1px solid var(--line)", borderRadius: 12, background: "#f1f5f9" }} />
        {!live && <div className="small muted">This is a preview of your edits. It does not send anything. Your live link and embed code appear here once your account is connected to the database.</div>}
      </div>

      <div className="stack" style={{ gap: 6 }}>
        <div className="bold small">Option 1: share a link</div>
        <p className="small muted" style={{ margin: 0 }}>Easiest. Use it as a "Request a quote" button on your site, or paste it anywhere.</p>
        <input className="input" readOnly value={live || "Available on live accounts"} onFocus={(e) => e.currentTarget.select()} aria-label="Lead form link" />
        {live && <div className="row wrap"><button className="btn" onClick={() => copy(live, "Link copied")}>Copy link</button><a className="btn" href={live} target="_blank" rel="noopener">Open form</a></div>}
      </div>

      <div className="stack" style={{ gap: 6 }}>
        <div className="bold small">Option 2: put the form on your website</div>
        <textarea className="textarea" readOnly rows={4} value={embed} onFocus={(e) => e.currentTarget.select()} aria-label="Embed code" />
        {live && <div><button className="btn" onClick={() => copy(embed, "Embed code copied")}>Copy embed code</button></div>}
        <details className="small">
          <summary className="bold">Where to paste it</summary>
          <p><b>WordPress:</b> edit the page, add a "Custom HTML" block, paste the code, Update.</p>
          <p><b>Wix:</b> Add (+), Embed Code, Embed HTML, choose "Code", paste, and resize.</p>
          <p><b>Squarespace:</b> add a Code block, paste, untick "Display source".</p>
          <p><b>GoDaddy / other builders:</b> look for "HTML", "Embed" or "Custom code", and paste it where the form should appear.</p>
          <p><b>No website?</b> Use Option 1 and send the link instead.</p>
          <p>Need a hand? Send the embed code to your web person and ask them to paste it into the page.</p>
        </details>
      </div>

      <div className="row wrap"><button className="btn" onClick={() => setDemoForm(true)}>{live ? "Send myself a test lead" : "Try it as a customer"}</button></div>

      {demoForm && (
        <Sheet title="Request service" onClose={() => setDemoForm(false)}>
          <form className="stack" onSubmit={async (e) => {
            e.preventDefault();
            const d = Object.fromEntries(new FormData(e.currentTarget).entries()) as Record<string, string>;
            if (!d.name?.trim() || (!d.phone?.trim() && !d.email?.trim())) return toast("Enter a name and a phone number or email");
            await store.saveRow("leads", { name: d.name.trim(), phone: d.phone ?? "", email: d.email ?? "", address: d.address ?? "", source: "Website form", service: d.service ?? "", value_cents: 0, stage: "new", notes: d.message ?? "", customer_id: null, estimate_id: null, job_id: null, created_at: new Date().toISOString() });
            await refresh(); setDemoForm(false); toast("Request received. Check Leads.");
          }}>
            <Field label="Full name *"><input className="input" name="name" /></Field>
            <div className="grid2 stack-sm"><Field label="Phone"><input className="input" name="phone" type="tel" /></Field><Field label="Email"><input className="input" name="email" type="email" /></Field></div>
            <Field label="Service address"><input className="input" name="address" /></Field>
            <Field label="What do you need done?"><input className="input" name="service" placeholder="e.g. AC not cooling" /></Field>
            <Field label="Additional details"><textarea className="textarea" name="message" /></Field>
            <button className="btn primary block" type="submit">Request service</button>
          </form>
        </Sheet>
      )}
      </div>
    </details>
  );
}
