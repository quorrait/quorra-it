import { useEffect, useState, type FormEvent } from "react";
import { applyStatusBar } from "../lib/native";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { APP_NAME } from "../lib/config";
import { hasSupabase } from "../lib/supabase";
import { apiBase } from "../lib/publicLinks";
import { Field } from "../components/ui";
import { errMsg } from "../lib/errors";

/** Public "Contact us" form. */
export default function Contact() {
  const [f, setF] = useState({ name: "", company: "", email: "", phone: "", best_way: "Email", message: "", hp: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);
  const nav = useNavigate();
  useEffect(() => { void applyStatusBar("login"); }, []);
  const back = (useLocation().state as { back?: string } | null)?.back ?? "/plans";
  const backName = back === "/billing" ? "Billing" : "plans";
  const set = (k: keyof typeof f, v: string) => setF({ ...f, [k]: v });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr(""); setBusy(true);
    try {
      if (!f.name.trim()) throw new Error("Please enter your name.");
      if (!f.message.trim()) throw new Error("Please tell us how we can help.");
      if (!f.email.trim() && f.phone.replace(/\D/g, "").length < 10) throw new Error("Please enter an email or a phone number so we can reach you.");
      if (hasSupabase) {
        const r = await fetch(`${apiBase()}/contact-request`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) }).catch(() => { throw new Error("We could not send that right now. Please try again in a minute or call us."); });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || "Could not send your request. Please try again.");
      }
      setDone(true);
      setTimeout(() => nav(back), 5000);
    } catch (e) { setErr(errMsg(e, "Could not send your request. Please try again.")); }
    finally { setBusy(false); }
  }

  if (done) return (
    <div className="auth"><div className="auth-card stack">
      <img src={`${import.meta.env.BASE_URL}logo-wide-v2.png`} alt="Quorra Dispatch" style={{ maxWidth: 240, margin: "0 auto", display: "block" }} />
      <h1 style={{ textAlign: "center" }}>Thank you</h1>
      <p className="muted">Our response time is 1-2 business days. We will reach out by {f.best_way.toLowerCase()}. Taking you back to {backName}...</p>
      <Link className="btn primary block" to={back}>Back to {backName}</Link>
    </div></div>
  );
  return (
    <div className="auth">
      <form className="auth-card stack" onSubmit={submit}>
        <div><Link to={back} className="small muted bold">← {backName === "Billing" ? "Billing" : "Plans"}</Link><h1 style={{ marginTop: 8 }}>Contact us</h1><p className="muted">Tell us about your business and how {APP_NAME} can help.</p></div>
        <Field label="Name"><input className="input" autoComplete="name" value={f.name} onChange={(e) => set("name", e.target.value)} required /></Field>
        <Field label="Company"><input className="input" autoComplete="organization" value={f.company} onChange={(e) => set("company", e.target.value)} /></Field>
        <Field label="Email"><input className="input" type="email" autoComplete="email" value={f.email} onChange={(e) => set("email", e.target.value)} /></Field>
        <Field label="Phone number"><input className="input" type="tel" autoComplete="tel" value={f.phone} onChange={(e) => set("phone", e.target.value)} /></Field>
        <Field label="Best way to be contacted">
          <select className="select" value={f.best_way} onChange={(e) => set("best_way", e.target.value)}><option>Email</option><option>Phone call</option><option>Text message</option></select>
        </Field>
        <Field label="How can we help?"><textarea className="textarea" rows={4} value={f.message} onChange={(e) => set("message", e.target.value)} required /></Field>
        <div style={{ position: "absolute", left: -9999 }} aria-hidden="true"><input tabIndex={-1} autoComplete="off" value={f.hp} onChange={(e) => set("hp", e.target.value)} /></div>
        {err && <div className="error-banner" style={{ margin: 0 }}>{err}</div>}
        <button className="btn primary block" disabled={busy}>{busy ? "Sending..." : "Send"}</button>
      </form>
    </div>
  );
}
