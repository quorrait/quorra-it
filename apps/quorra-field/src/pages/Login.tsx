import { useState, type FormEvent } from "react";
import { useAuth } from "../lib/app";
import { APP_NAME, APP_TAGLINE } from "../lib/config";
import { Field } from "../components/ui";

export default function Login() {
  const auth = useAuth();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
        const r = await auth.signUp(email, password);
        if (r.needsConfirm) setInfo("Check your email to confirm your account, then sign in.");
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <form className="auth-card stack" onSubmit={submit}>
        <div>
          <img className="logo-mark" src={`${import.meta.env.BASE_URL}logo.png`} alt="" />
          <h1>{APP_NAME}</h1>
          <p className="muted">{APP_TAGLINE}</p>
        </div>

        {auth.mode === "demo" && (
          <div className="notice">Demo mode: any email works and sample data is saved in this browser only.</div>
        )}

        <Field label="Email">
          <input className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required={auth.mode === "supabase"} placeholder="you@company.com" />
        </Field>
        <Field label="Password">
          <input className="input" type="password" autoComplete={mode === "in" ? "current-password" : "new-password"} value={password} onChange={(e) => setPassword(e.target.value)} required={auth.mode === "supabase"} minLength={6} placeholder="••••••••" />
        </Field>

        {err && <div className="error-banner" style={{ margin: 0 }}>{err}</div>}
        {info && <div className="notice">{info}</div>}

        <button className="btn primary block" disabled={busy}>
          {busy ? "One moment..." : mode === "in" ? (auth.mode === "demo" ? "Open the demo" : "Sign in") : "Create account"}
        </button>
        {auth.mode === "supabase" && (
          <button type="button" className="btn block" onClick={() => setMode(mode === "in" ? "up" : "in")}>
            {mode === "in" ? "New here? Create an account" : "Have an account? Sign in"}
          </button>
        )}
      </form>
    </div>
  );
}
