import { wasKicked } from "../lib/session";
import { errMsg } from "../lib/errors";
import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/app";
import { supabase } from "../lib/supabase";
import { APP_NAME } from "../lib/config";
import { PUBLIC_SITE_URL } from "../lib/publicUrl";
import { isIosApp } from "../lib/iosPlan";
import BuyService from "../components/BuyService";
import { Field, PasswordInput } from "../components/ui";
import { codeFromHash, inviteInfo, rememberInvite } from "../lib/team";
import { MIN_PASSWORD, passwordError } from "../lib/safeUrl";

/** Sign in. Creating a login here is only possible through a team invite; new businesses buy a plan first. */
export default function Login() {
  const auth = useAuth();
  const nav = useNavigate();
  const code = codeFromHash();
  const [invite, setInvite] = useState<{ business: string; email: string; role: string } | null>(null);
  const [mode, setMode] = useState<"in" | "up">(code ? "up" : "in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(() => (wasKicked() ? "You have been logged out because this account signed in on another device." : null));
  const [resendBusy, setResendBusy] = useState(false);

  useEffect(() => {
    if (!code) return;
    rememberInvite(code);
    void inviteInfo(code).then((i) => { setInvite(i); if (i) setEmail(i.email); });
  }, [code]);

  // Links from the website (?demo=1) open the demo already signed in.
  useEffect(() => {
    if (auth.mode !== "demo") return;
    try { if (new URLSearchParams(window.location.search).get("demo")) void auth.signIn("demo@quorrait.com", "demo"); } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    setInfo(null);
    try {
      if (mode === "in") {
        await auth.signIn(email, password);
        try { sessionStorage.setItem("qd_alive", "1"); remember ? localStorage.removeItem("qd_no_remember") : localStorage.setItem("qd_no_remember", "1"); } catch { /* ignore */ }
        // Ask the browser to offer "save password" right now, not later when the screen changes.
        try { const PC = (window as unknown as { PasswordCredential?: new (d: { id: string; password: string; name?: string }) => Credential }).PasswordCredential; if (PC && navigator.credentials) await navigator.credentials.store(new PC({ id: email, password, name: email })); } catch { /* not supported */ }
      }
      else {
        if (password !== confirm) throw new Error("The passwords do not match.");
        const pw = passwordError(password);
        if (pw) throw new Error(pw);
        const r = await auth.signUp(email, password);
        if (r.needsConfirm) setInfo("Check your email to confirm your account, then sign in with the same email.");
      }
    } catch (e) {
      const m = errMsg(e, "Something went wrong. Please try again.");
      if (/confirm/i.test(m)) setInfo("Check your email to confirm your account, then sign in with the same email.");
      else setErr(m);
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    if (!supabase || !email.trim()) return setErr("Enter your email, then resend the confirmation.");
    setResendBusy(true);
    setErr(null);
    try {
      const { error } = await supabase.functions.invoke("signup-complete", { body: { resend: true, email: email.trim() } });
      if (error) throw error;
      setInfo("Check your email to confirm your account, then sign in with the same email.");
    } catch (e) {
      setErr(errMsg(e, "Could not resend the confirmation email. Try again in a few minutes."));
    } finally {
      setResendBusy(false);
    }
  }

  const joining = Boolean(code);
  return (
    <div className="auth">
      <form className="auth-card stack" method="post" action="#" onSubmit={submit}>
        {import.meta.env.BASE_URL !== "./" && <a className="small muted" href={PUBLIC_SITE_URL}>‹ Back to website</a>}
        <div className="auth-head">
          {mode === "in" ? (
            <img className="auth-wide" src={`${import.meta.env.BASE_URL}logo-wide-v2.png`} alt={APP_NAME} />
          ) : (
            <>
              <img className="auth-mark" src={`${import.meta.env.BASE_URL}logo-mark-v2.png`} alt="" />
              <h1>Join {invite?.business ?? "your team"}</h1>
              <p className="muted">{invite ? `You were invited as ${invite.role}. Create your login to get started.` : "This invite is no longer valid. Ask your manager to send a new one."}</p>
            </>
          )}
        </div>

        {auth.mode === "demo" && <div className="notice">Demo mode: any email works and sample data is saved in this browser only.</div>}
        {joining && mode === "in" && <div className="notice">Sign in with the email you were invited with to join the team.</div>}

        <Field label="Email">
          <input className="input" type="email" name="email" id="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} readOnly={mode === "up" && Boolean(invite)} required={auth.mode === "supabase"} placeholder="you@company.com" />
        </Field>
        <Field label="Password">
          <PasswordInput name="password" id="password" autoComplete={mode === "in" ? "current-password" : "new-password"} value={password} onChange={(e) => setPassword(e.target.value)} required={auth.mode === "supabase"} minLength={mode === "up" ? MIN_PASSWORD : undefined} placeholder={mode === "up" ? "At least 8 characters" : "••••••••"} />
        </Field>
        {mode === "up" && (
          <Field label="Confirm password">
            <PasswordInput autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={MIN_PASSWORD} placeholder="Type it again" />
          </Field>
        )}

        {mode === "in" && <label className="check-row"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Remember me on this device</label>}
        {mode === "in" && auth.mode !== "demo" && <button type="button" className="btn block" disabled={resendBusy} onClick={() => void resend()}>{resendBusy ? "Sending..." : "Resend confirmation email"}</button>}
        {err && <div className="error-banner" style={{ margin: 0 }}>{err}</div>}
        {info && <div className="notice">{info}</div>}

        <button className="btn primary block" disabled={busy || (mode === "up" && !invite)}>
          {busy ? "One moment..." : mode === "in" ? (auth.mode === "demo" ? "Open the demo" : "Sign in") : "Create my login"}
        </button>
        {joining ? (
          <button type="button" className="btn block" onClick={() => setMode(mode === "in" ? "up" : "in")}>
            {mode === "in" ? "I need to create a login" : "I already have a login"}
          </button>
        ) : isIosApp() ? (
          <BuyService />
        ) : (
          <button type="button" className="btn block" onClick={() => nav("/plans")}>Buy service</button>
        )}
      </form>
    </div>
  );
}
