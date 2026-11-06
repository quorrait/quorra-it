import { useState, type FormEvent } from "react";
import { useAuth } from "../lib/app";
import { APP_NAME } from "../lib/config";
import { Field } from "../components/ui";

export default function Login() {
  const auth = useAuth();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [biz, setBiz] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    setInfo(null);
    try {
      if (mode === "in") await auth.signIn(email, password);
      else {
        if (!biz.trim() && auth.mode === "supabase") throw new Error("Enter your business name.");
        if (password !== confirm) throw new Error("The passwords do not match.");
        const r = await auth.signUp(email, password, biz.trim());
        if (r.needsConfirm) setInfo("Check your email to confirm your account, then sign in.");
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <form className="auth-card stack" onSubmit={submit}>
        <div className="auth-head">
          <img className="logo-mark" src={`${import.meta.env.BASE_URL}logo.png`} alt="" />
          <h1>{mode === "in" ? APP_NAME : "Create your account"}</h1>
          {mode === "up" && <p className="muted">{`Set up ${APP_NAME} for your business. It takes about a minute.`}</p>}
        </div>

        {auth.mode === "demo" && (
          <div className="notice">Demo mode: any email works and sample data is saved in this browser only.</div>
        )}

        {mode === "up" && auth.mode === "supabase" && (
          <Field label="Business name">
            <input className="input" autoComplete="organization" value={biz} onChange={(e) => setBiz(e.target.value)} placeholder="Summit Home Services" required />
          </Field>
        )}
        <Field label="Email">
          <input className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required={auth.mode === "supabase"} placeholder="you@company.com" />
        </Field>
        <Field label="Password">
          <input className="input" type="password" autoComplete={mode === "in" ? "current-password" : "new-password"} value={password} onChange={(e) => setPassword(e.target.value)} required={auth.mode === "supabase"} minLength={6} placeholder="••••••••" />
        </Field>

        {mode === "up" && (
          <Field label="Confirm password">
            <input className="input" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={6} placeholder="Type it again" />
          </Field>
        )}

        {err && <div className="error-banner" style={{ margin: 0 }}>{err}</div>}
        {info && <div className="notice">{info}</div>}

        <button className="btn primary block" disabled={busy}>
          {busy ? "One moment..." : mode === "in" ? (auth.mode === "demo" ? "Open the demo" : "Sign in") : "Create account"}
        </button>
        {auth.mode === "supabase" && (
          <button type="button" className="btn block" onClick={() => setMode(mode === "in" ? "up" : "in")}>
            {mode === "in" ? "New here? Create an account" : "Already have an account? Sign in"}
          </button>
        )}
      </form>
    </div>
  );
}
