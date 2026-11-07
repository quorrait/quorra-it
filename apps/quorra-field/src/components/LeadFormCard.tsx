import { errMsg } from "../lib/errors";
import { useMemo, useState } from "react";
import type { LeadFormSettings } from "../lib/types";
import { useData } from "../lib/app";
import { leadFormPreviewUrl, leadFormUrl } from "../lib/publicLinks";
import { Field, Sheet, Step, useToast } from "./ui";
import ColorPick from "./ColorPick";
import { MAX_FORM_HTML, STARTER_FORM, downloadText } from "../lib/customHtml";
import TemplateGallery, { type GalleryItem } from "./TemplateGallery";
import { LEAD_FORM_TEMPLATES, fillFormTemplate } from "../lib/leadFormTemplates";

const STANDARD = "standard";

/** Website lead form: pick a style, adjust the wording, then share the link or embed it. */
export default function LeadFormCard() {
  const { store, business, refresh } = useData();
  const toast = useToast();
  const [demoForm, setDemoForm] = useState(false);
  const live = leadFormUrl(business.lead_key, business.name);
  const [cfg, setCfg] = useState<LeadFormSettings>(business.lead_form ?? {});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const set = (p: Partial<LeadFormSettings>) => { setCfg((c) => ({ ...c, ...p })); setDirty(true); };
  const [servicesText, setServicesText] = useState((business.lead_form?.services ?? []).join("\n"));
  const services = useMemo(() => servicesText.split("\n").map((x) => x.trim()).filter(Boolean), [servicesText]);
  const preview = useMemo(() => ({ ...cfg, services }), [cfg, services]);
  const previewSrc = useMemo(() => leadFormPreviewUrl(business.name, preview), [business.name, preview]);
  const standardThumb = useMemo(() => leadFormPreviewUrl(business.name, { ...preview, custom_html: "" }), [business.name, preview]);

  const activeTpl = LEAD_FORM_TEMPLATES.find((t) => t.html === cfg.custom_html);
  const isStandard = !cfg.custom_html?.trim();
  const isCustom = !isStandard && !activeTpl;
  const currentId = isStandard ? STANDARD : activeTpl?.id;
  const styleName = isStandard ? "Standard form" : activeTpl ? `${activeTpl.name} style` : "Your custom HTML design";

  const items: GalleryItem[] = [
    { id: STANDARD, name: "Standard", desc: "The built-in form with optional fields", html: "", src: standardThumb },
    ...LEAD_FORM_TEMPLATES,
  ];

  /** Saves the form. Pass the new settings to save a change made a moment ago (state has not updated yet). */
  async function save(override?: LeadFormSettings, msg = "Form saved. Your website form updates right away.") {
    const base = override ?? cfg;
    const next = { ...base, services: services.length ? services : undefined, custom_html: base.custom_html?.trim() ? base.custom_html : undefined };
    setSaving(true);
    try { await store.saveBusiness({ lead_form: next }); await refresh(); setDirty(false); toast(msg); }
    catch (e) { toast(errMsg(e, "Could not save")); }
    finally { setSaving(false); }
  }
  async function upload(f?: File) {
    if (!f) return;
    if (f.size > MAX_FORM_HTML) return toast(`That file is too big. Keep it under ${Math.round(MAX_FORM_HTML / 1000)} KB.`);
    const next = { ...cfg, custom_html: await f.text() };
    setCfg(next);
    await save(next, "Design uploaded and saved. Your website form updates right away.");
  }
  function pick(t: GalleryItem) {
    const next = { ...cfg, custom_html: t.id === STANDARD ? "" : t.html };
    setCfg(next);
    void save(next, t.id === STANDARD ? "Standard form is back" : `${t.name} style saved. Your website form updates right away.`);
  }
  const embed = `<iframe src="${live || "https://your-form-link"}" title="Request service" style="width:100%;max-width:600px;height:760px;border:0" loading="lazy"></iframe>`;
  const copy = async (text: string, msg: string) => { try { await navigator.clipboard.writeText(text); toast(msg); } catch { toast("Copy failed. Select the text and copy it manually."); } };

  return (
    <details className="card fold">
      <summary><span className="card-title">Website lead form</span></summary>
      <div className="stack">
        <p className="small muted" style={{ margin: 0 }}>A request form for your website. When a customer fills it out, it lands in <b>Leads</b> as a new lead and you get a badge on the Leads tab.</p>

        <Step n={1} title="Choose a style" hint="Tap a preview to see it full size. You can switch any time.">
          <TemplateGallery items={items} pageW={560} pageH={760} currentId={currentId} busy={saving}
            render={(h) => fillFormTemplate(h, business.name, preview)}
            previewNote="Preview only. Your wording, color and company name fill in automatically."
            onPick={pick} />
          {isCustom && <div className="notice">You are using your own HTML design (see Advanced below). Choose a style above to replace it.</div>}
        </Step>

        <div className="split">
          <div className="stack">
            <Step n={2} title="Make it yours" hint={`Applies to the ${styleName.toLowerCase()}.`}>
              <Field label="Heading"><input className="input" value={cfg.heading ?? ""} placeholder="Leave blank to use the style's own heading" onChange={(e) => set({ heading: e.target.value })} /></Field>
              <Field label="Intro text"><textarea className="textarea" rows={2} value={cfg.intro ?? ""} placeholder="Leave blank to use the style's own intro" onChange={(e) => set({ intro: e.target.value })} /></Field>
              <div className="grid2 stack-sm">
                <Field label="Button text"><input className="input" value={cfg.button ?? ""} placeholder="Style default" onChange={(e) => set({ button: e.target.value })} /></Field>
                <Field label="Accent color"><ColorPick value={cfg.accent ?? "#ea580c"} onChange={(c) => set({ accent: c })} swatches={["#ea580c", "#0F2742", "#1D4ED8", "#047857"]} label="Accent color" /></Field>
              </div>
              <Field label="Thank-you message"><input className="input" value={cfg.thanks ?? ""} placeholder="Thank you. Your request was sent and we will contact you shortly." onChange={(e) => set({ thanks: e.target.value })} /></Field>
              <Field label="Service choices (one per line)"><textarea className="textarea" rows={4} value={servicesText} placeholder={"AC repair\nFurnace repair\nNew install"} onChange={(e) => { setServicesText(e.target.value); setDirty(true); }} /></Field>
              {isStandard ? (
                <div className="stack" style={{ gap: 8 }}>
                  <Field label="Extra question (optional)"><input className="input" value={cfg.extra_label ?? ""} placeholder="e.g. How did you hear about us?" onChange={(e) => set({ extra_label: e.target.value })} /></Field>
                  <label className="row small"><input type="checkbox" checked={cfg.show_email !== false} onChange={(e) => set({ show_email: e.target.checked })} /> Ask for email</label>
                  <label className="row small"><input type="checkbox" checked={cfg.show_address !== false} onChange={(e) => set({ show_address: e.target.checked })} /> Ask for service address</label>
                  <label className="row small"><input type="checkbox" checked={Boolean(cfg.require_phone)} onChange={(e) => set({ require_phone: e.target.checked })} /> Require a phone number</label>
                </div>
              ) : (
                <p className="small muted" style={{ margin: 0 }}>Which fields are asked is part of the style. Pick <b>Standard</b> above if you want to switch email, address and phone on or off.</p>
              )}
              <div><button className="btn primary" disabled={!dirty || saving} onClick={() => void save()}>{saving ? "Saving..." : "Save changes"}</button></div>
            </Step>
          </div>
          <div className="stack sticky" style={{ gap: 6 }}>
            <div className="bold small">Live preview</div>
            <iframe key={previewSrc} title="Lead form preview" src={previewSrc} style={{ width: "100%", height: 700, border: "1px solid var(--line)", borderRadius: 12, background: "#f1f5f9" }} />
            <div className="small muted">{live ? "Shows your unsaved edits. Nothing is sent from the preview." : "Shows your edits. Your live link and embed code appear once your account is connected to the database."}</div>
          </div>
        </div>

        <Step n={3} title="Put it to work">
          <div className="stack" style={{ gap: 6 }}>
            <div className="bold small">Share a link</div>
            <p className="small muted" style={{ margin: 0 }}>Easiest. Use it as a "Request a quote" button on your site, or paste it into a text, email, Facebook page or Google Business profile.</p>
            <input className="input" readOnly value={live || "Available on live accounts"} onFocus={(e) => e.currentTarget.select()} aria-label="Lead form link" />
            {live && <div className="row wrap"><button className="btn" onClick={() => copy(live, "Link copied")}>Copy link</button><a className="btn" href={live} target="_blank" rel="noopener">Open form</a></div>}
          </div>
          <div className="stack" style={{ gap: 6 }}>
            <div className="bold small">Embed it on your website</div>
            <textarea className="textarea" readOnly rows={4} value={embed} onFocus={(e) => e.currentTarget.select()} aria-label="Embed code" />
            {live && <div><button className="btn" onClick={() => copy(embed, "Embed code copied")}>Copy embed code</button></div>}
            <details className="small">
              <summary className="bold">Where to paste it</summary>
              <p><b>WordPress:</b> edit the page, add a "Custom HTML" block, paste the code, Update.</p>
              <p><b>Wix:</b> Add (+), Embed Code, Embed HTML, choose "Code", paste, and resize.</p>
              <p><b>Squarespace:</b> add a Code block, paste, untick "Display source".</p>
              <p><b>GoDaddy / other builders:</b> look for "HTML", "Embed" or "Custom code", and paste it where the form should appear.</p>
              <p><b>No website?</b> Use the link and send it instead. Or send the embed code to your web person.</p>
            </details>
          </div>
          <div><button className="btn" onClick={() => setDemoForm(true)}>{live ? "Send myself a test lead" : "Try it as a customer"}</button></div>
        </Step>

        <details className="adv">
          <summary>Advanced: custom HTML design</summary>
          <div className="stack" style={{ marginTop: 10 }}>
            <p className="small muted" style={{ margin: 0 }}>For a web designer, or if you already have a form design. Upload an HTML file or paste it. It replaces the style above. Name the fields <code>name</code>, <code>phone</code>, <code>email</code>, <code>address</code>, <code>service</code> and <code>message</code> so requests land in Leads. Any other field is added to the lead's notes. Your page runs in a sealed box, so it can't touch your account.</p>
            <p className="small muted" style={{ margin: 0 }}>Placeholders: <code>{"{{business_name}}"}</code> <code>{"{{accent}}"}</code> <code>{"{{heading|Default text}}"}</code> <code>{"{{intro|Default text}}"}</code> <code>{"{{button|Default text}}"}</code> <code>{"{{service_options}}"}</code></p>
            <div className="row wrap">
              <label className="btn">Upload .html<input type="file" accept=".html,.htm,text/html" hidden onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = ""; }} /></label>
              <button type="button" className="btn" onClick={() => downloadText("lead-form-starter.html", STARTER_FORM)}>Download a starter file</button>
              {cfg.custom_html && <button type="button" className="btn" disabled={saving} onClick={() => { const next = { ...cfg, custom_html: "" }; setCfg(next); void save(next, "Standard form is back"); }}>Switch back to Standard</button>}
            </div>
            <textarea className="textarea" rows={6} value={cfg.custom_html ?? ""} maxLength={MAX_FORM_HTML} onChange={(e) => set({ custom_html: e.target.value })} placeholder="Or paste your HTML here" style={{ fontFamily: "monospace", fontSize: 12 }} />
          </div>
        </details>

        {dirty && (
          <div className="savebar" role="status">
            <span>You have unsaved changes</span>
            <button className="btn primary sm" disabled={saving} onClick={() => void save()}>{saving ? "Saving..." : "Save changes"}</button>
          </div>
        )}

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
