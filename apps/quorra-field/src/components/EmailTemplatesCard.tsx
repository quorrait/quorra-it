import { useState } from "react";
import { useData } from "../lib/app";
import { Field, useToast } from "./ui";
import { TPL_DEFAULTS, TPL_LABEL, TPL_VARS, fill, getTpl, type TplKey } from "../lib/emailTemplates";
import { errMsg } from "../lib/errors";

const KEYS: TplKey[] = ["reminder", "quote", "invoice", "nudge"];

/** Edit the wording of the emails customers receive. Blank fields use the default wording. */
export default function EmailTemplatesCard() {
  const { business, store, refresh } = useData();
  const toast = useToast();
  const [key, setKey] = useState<TplKey>("reminder");
  const saved = (business.email_templates ?? {}) as Record<string, Partial<{ subject: string; heading: string; message: string }>>;
  const cur = getTpl(saved, key);
  const [draft, setDraft] = useState(cur);
  const [busy, setBusy] = useState(false);
  const pick = (k: TplKey) => { setKey(k); setDraft(getTpl(saved, k)); };
  const sample = { customer: "Sam", business: business.name || "Your Company", service: "AC tune-up", date: "Tuesday, November 10", time: "9:00 AM", address: "123 Main St", phone: business.phone || "(916) 555-0100", total: "$285.00" };
  const dirty = draft.subject !== cur.subject || draft.heading !== cur.heading || draft.message !== cur.message;

  async function save(next: Record<string, { subject?: string; heading?: string; message?: string }>, done: string) {
    setBusy(true);
    try { await store.saveBusiness({ email_templates: next }); await refresh(); toast(done); } catch (e) { toast(errMsg(e, "Could not save. Run the latest database update first.")); } finally { setBusy(false); }
  }
  const saveThis = () => save({ ...saved, [key]: draft }, "Email saved");
  const reset = async () => { const { [key]: _x, ...rest } = saved; void _x; setDraft(TPL_DEFAULTS[key]); await save(rest, "Back to the default wording"); };

  return (
    <div className="card stack">
      <div className="card-title" style={{ margin: 0 }}>Customer emails</div>
      <div className="small muted">Change the wording of the emails your customers get. Your business name and branding are added automatically. Use the placeholders below and they fill in for each customer.</div>
      <div className="chips" style={{ flexWrap: "wrap" }}>{KEYS.map((k) => <button key={k} className={`chip${key === k ? " on" : ""}`} style={{ minHeight: 40 }} onClick={() => pick(k)}>{TPL_LABEL[k].name}</button>)}</div>
      <div className="small muted">{TPL_LABEL[key].when}</div>
      <Field label="Subject line"><input className="input" value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} /></Field>
      <Field label="Heading"><input className="input" value={draft.heading} onChange={(e) => setDraft({ ...draft, heading: e.target.value })} /></Field>
      <Field label="Message"><textarea className="textarea" rows={9} value={draft.message} onChange={(e) => setDraft({ ...draft, message: e.target.value })} /></Field>
      <div className="small muted">Placeholders: {TPL_VARS.map((v) => <code key={v} style={{ marginRight: 8 }}>{`{${v}}`}</code>)}</div>
      <div className="card" style={{ background: "#f8fafc" }}>
        <div className="small muted" style={{ marginBottom: 6 }}>Preview</div>
        <div className="bold">{fill(draft.subject, sample)}</div>
        <div style={{ fontWeight: 700, fontSize: 18, margin: "10px 0 6px" }}>{fill(draft.heading, sample)}</div>
        <div style={{ whiteSpace: "pre-wrap" }}>{fill(draft.message, sample)}</div>
      </div>
      <div className="row wrap">
        <button className="btn primary grow" disabled={busy || !dirty} onClick={() => void saveThis()}>Save</button>
        {saved[key] && <button className="btn grow" disabled={busy} onClick={() => void reset()}>Use default wording</button>}
      </div>
    </div>
  );
}
