import { errMsg } from "../lib/errors";
import { useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../lib/app";
import { hasSupabase, supabase } from "../lib/supabase";
import { PLANS } from "../lib/plans";
import { TRIAL_DAYS } from "../lib/plans";
import { money } from "../lib/money";
import { Field } from "../components/ui";

/** Buy service: create the account, then go straight to Stripe to pay for the plan. */
export default function Start() {
  const auth = useAuth();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const plan = PLANS.find((p) => p.id === params.get("plan")) ?? PLANS[1];
  const [biz, setBiz] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    if (hasSupabase && !biz.trim()) return setErr("Enter your business name.");
    if (password !== confirm) return setErr("The passwords do not match.");
    setBusy(true);
    try {
      const r = await auth.signUp(email, password, biz.trim());
      if (r.needsConfirm) { setInfo("Check your email to confirm your account, then sign in. You will be asked to start your plan."); return; }
      if (hasSupabase && supabase) {
        const { data, error } = await supabase.functions.invoke("billing-checkout", { body: { plan: plan.id } });
        if (error || !data?.url) {
          let m = data?.error ?? "Your account is created, but we could not open payment. Sign in and choose your plan under Billing.";
          try { const ctx = (error as { context?: Response } | null)?.context; if (ctx) m = (await ctx.json()).error ?? m; } catch { /* ignore */ }
          throw new Error(m);
        }
        location.href = data.url as string; // Stripe Checkout
      }
    } catch (e2) {
      setErr(errMsg(e2, "Something went wrong. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <form className="auth-card stack" onSubmit={submit}>
        <div className="auth-head">
          <img className="auth-mark" src={`${import.meta.env.BASE_URL}logo-mark-v2.png`} alt="" />
          <h1>Create your account</h1>
          <p className="muted">You are signing up for the <b>{plan.name}</b> plan, {money(plan.price_cents).replace(".00", "")} per month after your {TRIAL_DAYS}-day free trial. You add a card on the next step, and nothing is charged until the trial ends. Cancel any time before then.</p>
        </div>
        {!hasSupabase && <div className="notice">Demo mode: no payment is taken.</div>}
        <Field label="Business name"><input className="input" autoComplete="organization" value={biz} onChange={(e) => setBiz(e.target.value)} placeholder="Summit Home Services" required={hasSupabase} /></Field>
        <Field label="Email"><input className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" required={hasSupabase} /></Field>
        <Field label="Password"><input className="input" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} required={hasSupabase} placeholder="At least 6 characters" /></Field>
        <Field label="Confirm password"><input className="input" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} minLength={6} required={hasSupabase} placeholder="Type it again" /></Field>
        {err && <div className="error-banner" style={{ margin: 0 }}>{err}</div>}
        {info && <div className="notice">{info}</div>}
        <button className="btn primary block" disabled={busy}>{busy ? "One moment..." : hasSupabase ? "Start free trial" : "Open the demo"}</button>
        <button type="button" className="btn block" onClick={() => nav("/plans")}>Back to plans</button>
      </form>
    </div>
  );
}
