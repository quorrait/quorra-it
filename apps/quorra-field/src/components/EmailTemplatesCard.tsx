import { useMemo, useState } from "react";
import { useData } from "../lib/app";
import { Field, useToast } from "./ui";
import { TPL_DEFAULTS, TPL_LABEL, TPL_VARS, THEME_LABEL, LOOK_DEFAULT, fill, getStyle, getTpl, type EmailLook, type TplKey } from "../lib/emailTemplates";
import { emailHtml } from "../lib/emailHtml";
import { errMsg } from "../lib/errors";
import { useRegisterSave } from "../lib/saveAll";

const KEYS: TplKey[] = ["reminder", "quote", "invoice", "nudge"];
type Saved = Record<string, unknown>;
const EXTRA: Record<TplKey, { rows?: { label: string; value: string }[]; button?: { label: string; url: string } }> = {
  reminder: { rows: [{ label: "Service", value: "AC tune-up" }, { label: "Appointment", value: "Tuesday, November 10 at 9:00 AM" }, { label: "Location", value: "123 Main St" }] },
  quote: { rows: [{ label: "Quote for", value: "AC tune-up" }, { label: "Total", value: "$285.00" }], button: { label: "View and accept quote", url: "#" } },
  invoice: { rows: [{ label: "Invoice for", value: "AC tune-up" }, { label: "Balance due", value: "$285.00" }], button: { label: "View and pay invoice", url: "#" } },
  nudge: { button: { label: "Choose my time", url: "#" } },
};

/** Edit the wording and look of the emails customers receive. Blank fields use the default wording. */
export default function EmailTemplatesCard() {
  const { business, store, refresh } = useData();
  const toast = useToast();
  const [key, setKey] = useState<TplKey>("reminder");
  const saved = (business.email_templates ?? {}) as Saved;
  const cur = getTpl(saved, key);
  const [draft, setDraft] = useState(cur);
  const savedLook = getStyle(saved);
  const [look, setLook] = useState<EmailLook>(savedLook);
  const [busy, setBusy] = useState(false);
  const pick = (k: TplKey) => { setKey(k); setDraft(getTpl(saved, k)); };
  const sample = { customer: "Sam", business: business.name || "Your Company", service: "AC tune-up", date: "Tuesday, November 10", time: "9:00 AM", address: "123 Main St", phone: business.phone || "(916) 555-0100", total: "$285.00" };
  const dirty = draft.subject !== cur.subject || draft.heading !== cur.heading || draft.message !== cur.message;
  const lookDirty = look.theme !== savedLook.theme || look.header !== savedLook.header || look.accent !== savedLook.accent;
  const html = useMemo(() => emailHtml({ brand: business.name || "Your Company", style: look, heading: fill(draft.heading, sample), paragraphs: fill(draft.message, sample).split(/\n{2,}/), ...EXTRA[key] }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [look, draft, key, business.name, business.phone]);

  async function save(next: Saved, done: string) {
    setBusy(true);
    try { await store.saveBusiness({ email_templates: next }); await refresh(); toast(done); } catch (e) { toast(errMsg(e, "Could not save. Run the latest database update first.")); } finally { setBusy(false); }
  }
  const reset = async () => { const { [key]: _x, ...rest } = saved; void _x; setDraft(TPL_DEFAULTS[key]); await save(rest, "Back to the default wording"); };
  useRegisterSave("emails", dirty || lookDirty, async () => {
    const next: Saved = { ...saved };
    if (dirty) next[key] = draft;
    if (lookDirty) next._style = look;
    await save(next, "Emails saved");
  });

  return (
    <div className="card stack">
      <div className="card-title" style={{ margin: 0 }}>Customer emails</div>
      <div className="small muted">Customers see these from your business name, and replies go to your business email. Pick a style and colors, then edit each email. The preview updates as you type. Use Save changes at the top or bottom of the page.</div>

      <div className="em-grid">
        <div className="stack">
          <div className="bold">Email style</div>
          <div className="chips" style={{ flexWrap: "wrap" }}>{(Object.keys(THEME_LABEL) as EmailLook["theme"][]).map((t) => <button key={t} className={`chip${look.theme === t ? " on" : ""}`} style={{ minHeight: 40 }} onClick={() => setLook({ ...look, theme: t })}>{THEME_LABEL[t]}</button>)}</div>
          <div className="row wrap" style={{ gap: 16, alignItems: "center" }}>
            <label className="row" style={{ gap: 8, alignItems: "center" }}><input type="color" value={look.header} onChange={(e) => setLook({ ...look, header: e.target.value })} style={{ width: 44, height: 36, padding: 0, border: "none", background: "none" }} /><span className="small">Header color</span></label>
            <label className="row" style={{ gap: 8, alignItems: "center" }}><input type="color" value={look.accent} onChange={(e) => setLook({ ...look, accent: e.target.value })} style={{ width: 44, height: 36, padding: 0, border: "none", background: "none" }} /><span className="small">Button/accent color</span></label>
            <button className="btn sm" onClick={() => setLook({ ...LOOK_DEFAULT, theme: look.theme })}>Reset colors</button>
          </div>

          <div className="bold" style={{ marginTop: 10 }}>Edit emails</div>
          <div className="chips" style={{ flexWrap: "wrap" }}>{KEYS.map((k) => <button key={k} className={`chip${key === k ? " on" : ""}`} style={{ minHeight: 40 }} onClick={() => pick(k)}>{TPL_LABEL[k].name}</button>)}</div>
          <div className="small muted">{TPL_LABEL[key].when}</div>
          <Field label="Subject line"><input className="input" value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} /></Field>
          <Field label="Heading"><input className="input" value={draft.heading} onChange={(e) => setDraft({ ...draft, heading: e.target.value })} /></Field>
          <Field label="Message"><textarea className="textarea" rows={9} value={draft.message} onChange={(e) => setDraft({ ...draft, message: e.target.value })} /></Field>
          <div className="small muted">Placeholders: {TPL_VARS.map((v) => <code key={v} style={{ marginRight: 8 }}>{`{${v}}`}</code>)}</div>
          <div className="row wrap">
            {saved[key] != null && <button className="btn grow" disabled={busy} onClick={() => void reset()}>Use default wording</button>}
          </div>
        </div>
        <div className="em-prev stack">
          <div className="small muted">Preview. Subject: <span className="bold">{fill(draft.subject, sample)}</span></div>
          <iframe title="Email preview" srcDoc={html} sandbox="" style={{ width: "100%", height: 640, border: "1px solid var(--line, #e2e8f0)", borderRadius: 12, background: "#fff" }} />
        </div>
      </div>
    </div>
  );
}
