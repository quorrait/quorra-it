import { useState } from "react";
import { useData } from "../lib/app";
import { leadFormPreviewUrl, leadFormUrl } from "../lib/publicLinks";
import { Field, Sheet, useToast } from "./ui";

/** Website lead form: explains how it works, previews it, and gives the link and embed code. */
export default function LeadFormCard() {
  const { store, business, refresh } = useData();
  const toast = useToast();
  const [demoForm, setDemoForm] = useState(false);
  const live = leadFormUrl(business.lead_key, business.name);
  const previewSrc = live || leadFormPreviewUrl(business.name);
  const embed = `<iframe src="${live || "https://your-form-link"}" title="Request service" style="width:100%;max-width:600px;height:760px;border:0" loading="lazy"></iframe>`;
  const copy = async (text: string, msg: string) => { try { await navigator.clipboard.writeText(text); toast(msg); } catch { toast("Copy failed. Select the text and copy it manually."); } };

  return (
    <div className="card stack">
      <div className="card-title" style={{ margin: 0 }}>Website lead form</div>
      <p className="small muted">A ready-made request form for your website. When a customer fills it out, the request shows up under Leads as a new lead and you get a badge on the Leads tab.</p>

      <div className="stack" style={{ gap: 6 }}>
        <div className="bold small">How it works</div>
        <ol className="small" style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 4 }}>
          <li>Put the form on your website, or share its link in a text, email, Facebook page or Google Business profile.</li>
          <li>The customer enters their name, contact info and what they need.</li>
          <li>It lands in Leads as New. From there you move it to Contacted, then Send quote, and the rest follows.</li>
        </ol>
      </div>

      <div className="stack" style={{ gap: 6 }}>
        <div className="bold small">Preview</div>
        <iframe title="Lead form preview" src={previewSrc} style={{ width: "100%", height: 640, border: "1px solid var(--line)", borderRadius: 12, background: "#f1f5f9" }} />
        {!live && <div className="small muted">This is a preview. It does not send anything. Your live link and embed code appear here once your account is connected to the database.</div>}
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
  );
}
