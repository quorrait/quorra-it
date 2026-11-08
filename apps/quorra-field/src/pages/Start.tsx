import { errMsg } from "../lib/errors";
import { useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../lib/app";
import { hasSupabase, supabase } from "../lib/supabase";
import { PLANS, ANNUAL_DISCOUNT, annualCents } from "../lib/plans";
import { TRIAL_DAYS } from "../lib/plans";
import { money } from "../lib/money";
import { Field, PasswordInput } from "../components/ui";
import EmbeddedStripe from "../components/EmbeddedStripe";

/** Buy service: create the account, then go straight to Stripe to pay for the plan. */
export default function Start() {
  const auth = useAuth();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const interval = params.get("interval") === "year" ? "year" : "month";
  const plan = PLANS.find((p) => p.id === params.get("plan")) ?? PLANS[1];
  const [yourName, setYourName] = useState("");
  const [biz, setBiz] = useState("");
  const [card, setCard] = useState<{ client_secret: string; publishable_key: string; session_id: string } | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    if (hasSupabase && !yourName.trim()) return setErr("Enter your name.");
    if (hasSupabase && !biz.trim()) return setErr("Enter your business name.");
    if (password !== confirm) return setErr("The passwords do not match.");
    setBusy(true);
    try {
      if (!hasSupabase || !supabase) { await auth.signUp(email, password, biz.trim()); return; }
      // The account is only created after the card is verified, so unpaid signups never exist.
      const { data, error } = await supabase.functions.invoke("signup-checkout", { body: { email, name: yourName.trim(), business: biz.trim(), plan: plan.id, interval } });
      if (error) { let m = error.message; try { const ctx = (error as { context?: Response }).context; if (ctx) m = (await ctx.json()).error ?? m; } catch { /* ignore */ } throw new Error(m); }
      setCard(data as { client_secret: string; publishable_key: string; session_id: string });
    } catch (e2) {
      setErr(errMsg(e2, "Something went wrong. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  async function cardDone() {
    if (!card || !supabase) return;
    setFinishing(true);
    setErr(null);
    try {
      const { error } = await supabase.functions.invoke("signup-complete", { body: { session_id: card.session_id, email, password } });
      if (error) { let m = error.message; try { const ctx = (error as { context?: Response }).context; if (ctx) m = (await ctx.json()).error ?? m; } catch { /* ignore */ } throw new Error(m); }
      await auth.signIn(email, password);
      try { sessionStorage.setItem("qd_alive", "1"); } catch { /* ignore */ }
      location.hash = "#/";
    } catch (e2) {
      setErr(errMsg(e2, "Your card was saved but the account could not be finished. Try signing in, or contact support."));
      setFinishing(false);
    }
  }

  if (card) {
    return (
      <div className="auth">
        <div className="auth-card stack" style={{ maxWidth: 520 }}>
          <div className="auth-head">
            <img className="auth-mark" src={`${import.meta.env.BASE_URL}logo-mark-v2.png`} alt="" />
            <h1>Add your card</h1>
            <p className="muted">{plan.name} plan after a {TRIAL_DAYS}-day free trial. Nothing is charged until the trial ends, and your account is created as soon as your card is verified.</p>
          </div>
          {err && <div className="error-banner" style={{ margin: 0 }}>{err}</div>}
          {finishing ? <div className="notice">Card verified. Setting up your account...</div> : <EmbeddedStripe publishableKey={card.publishable_key} clientSecret={card.client_secret} onComplete={() => void cardDone()} />}
          {!finishing && <button type="button" className="btn block" onClick={() => setCard(null)}>Back</button>}
        </div>
      </div>
    );
  }

  return (
    <div className="auth">
      <form className="auth-card stack" onSubmit={submit}>
        <div className="auth-head">
          <img className="auth-mark" src={`${import.meta.env.BASE_URL}logo-mark-v2.png`} alt="" />
          <h1>Create your account</h1>
          <p className="muted">You are signing up for the <b>{plan.name}</b> plan, {interval === "year" ? `${money(annualCents(plan)).replace(".00", "")} per year (${ANNUAL_DISCOUNT}% off)` : `${money(plan.price_cents).replace(".00", "")} per month`} after your {TRIAL_DAYS}-day free trial. You add a card on the next step, and your account is created once it is verified. Nothing is charged until the trial ends. Cancel any time before then.</p>
        </div>
        {!hasSupabase && <div className="notice">Demo mode: no payment is taken.</div>}
        <Field label="Your name"><input className="input" autoComplete="name" value={yourName} onChange={(e) => setYourName(e.target.value)} placeholder="Jane Smith" required={hasSupabase} /></Field>
        <Field label="Business name"><input className="input" autoComplete="organization" value={biz} onChange={(e) => setBiz(e.target.value)} placeholder="Summit Home Services" required={hasSupabase} /></Field>
        <Field label="Email"><input className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" required={hasSupabase} /></Field>
        <Field label="Password"><PasswordInput autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} required={hasSupabase} placeholder="At least 6 characters" /></Field>
        <Field label="Confirm password"><PasswordInput autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} minLength={6} required={hasSupabase} placeholder="Type it again" /></Field>
        {err && <div className="error-banner" style={{ margin: 0 }}>{err}</div>}
        {info && <div className="notice">{info}</div>}
        <button className="btn primary block" disabled={busy}>{busy ? "One moment..." : hasSupabase ? "Continue to card" : "Open the demo"}</button>
        <button type="button" className="btn block" onClick={() => nav("/plans")}>Back to plans</button>
      </form>
    </div>
  );
}
