import { useState, type FormEvent } from "react";
import { useData } from "../lib/app";
import { Field, useToast } from "../components/ui";
import { errMsg } from "../lib/errors";
import { hasSupabase, supabase } from "../lib/supabase";
import { SUPPORT_EMAIL } from "../lib/publicUrl";

const CATS: [string, string][] = [["question", "Question"], ["problem", "Something is not working"], ["billing", "Billing"], ["idea", "Idea or request"]];

/** Support: sends a message to us from inside the app. */
export default function Support() {
  const { business } = useData();
  const toast = useToast();
  const [category, setCategory] = useState("question");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!subject.trim() || !message.trim()) return toast("Add a subject and a message.");
    setBusy(true);
    try {
      if (hasSupabase && supabase) {
        const { error } = await supabase.functions.invoke("support-request", { body: { category, subject, message } });
        if (error) throw error;
      }
      setSent(true); setSubject(""); setMessage("");
    } catch (e) { toast(errMsg(e, `Could not send. Please try again, or email ${SUPPORT_EMAIL}.`)); }
    finally { setBusy(false); }
  }

  return (
    <div className="stack">
      <h1>Support</h1>
      <div><button type="button" className="btn" onClick={() => window.dispatchEvent(new Event("qd-tour"))}>Take the app tour</button></div>
      {sent ? (
        <div className="card stack">
          <div className="card-title" style={{ margin: 0 }}>Message sent</div>
          <p className="muted" style={{ margin: 0 }}>We will reply to your login email within 1 to 2 business days.</p>
          <button className="btn" onClick={() => setSent(false)}>Send another</button>
        </div>
      ) : (
        <form className="card stack" onSubmit={submit}>
          <p className="muted" style={{ margin: 0 }}>Tell us what you need help with{business.name ? `, ${business.name}` : ""}. We reply to your login email.</p>
          <Field label="Topic"><select className="select" value={category} onChange={(e) => setCategory(e.target.value)}>{CATS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
          <Field label="Subject"><input className="input" value={subject} maxLength={150} onChange={(e) => setSubject(e.target.value)} /></Field>
          <Field label="Message"><textarea className="textarea" rows={6} value={message} maxLength={4000} onChange={(e) => setMessage(e.target.value)} placeholder="What happened, and what did you expect?" /></Field>
          <button className="btn primary block" disabled={busy}>{busy ? "Sending..." : "Send to support"}</button>
        </form>
      )}
    </div>
  );
}
