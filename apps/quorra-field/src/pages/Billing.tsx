import { errMsg } from "../lib/errors";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useData } from "../lib/app";
import { hasSupabase, supabase } from "../lib/supabase";
import { fmtDate } from "../lib/dates";
import { money } from "../lib/money";
import { Field, Sheet, Spinner, useToast } from "../components/ui";
import PlanCards from "../components/PlanCards";
import { PLANS, planByName } from "../lib/plans";

interface Charge { id: string; date: string; description: string; amount_cents: number; status: string; receipt_url: string | null }
const DEMO_CHARGES: Charge[] = [
  { id: "d1", date: new Date(Date.now() - 11 * 86400_000).toISOString(), description: "Essentials", amount_cents: 19000, status: "paid", receipt_url: null },
  { id: "d2", date: new Date(Date.now() - 41 * 86400_000).toISOString(), description: "Essentials", amount_cents: 19000, status: "paid", receipt_url: null },
];

/** Plan, status and the buttons that hand off to Stripe for card, receipts, plan changes and cancelling. */
export default function Billing() {
  const { loading, subscription: sub, me, refresh, locked } = useData();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [busy, setBusy] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [why, setWhy] = useState({ reason: "", details: "", contact: false, phone: "" });
  const [charges, setCharges] = useState<Charge[] | null>(null);

  useEffect(() => {
    if (params.get("canceled")) { toast("Your plan is canceled. You keep access until the end of the period you paid for."); setParams({}, { replace: true }); void refresh(); return; }
    if (params.get("subscribed")) { toast("Thanks. Your plan can take a few seconds to show as active."); setParams({}, { replace: true }); const t = [3000, 8000].map((ms) => setTimeout(() => void refresh(), ms)); void refresh(); return () => t.forEach(clearTimeout); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isOwner = me.isOwner;
  const hasPlan = Boolean(sub && !sub.comped && sub.status !== "none");
  useEffect(() => {
    if (!isOwner || !hasPlan) return;
    if (!hasSupabase || !supabase) { setCharges(DEMO_CHARGES); return; }
    void supabase.functions.invoke("billing-history").then(({ data }) => setCharges((data?.charges as Charge[]) ?? [])).catch(() => setCharges([]));
  }, [isOwner, hasPlan, sub?.current_period_end]);

  if (loading) return <Spinner />;
  const status = sub?.status ?? "none";
  // Name from the saved plan; if that is generic, work it out from the price charged.
  const named = planByName(sub?.plan) ?? PLANS.find((p) => p.price_cents === sub?.amount_cents);
  const planLabel = named ? named.name : sub?.plan ?? "No plan yet";
  const active = status === "active" || status === "past_due" || sub?.comped;

  async function go(fn: "billing-checkout" | "billing-portal", flow?: "cancel" | "update", plan?: string, interval?: string) {
    if (!hasSupabase || !supabase) return toast("Billing runs through Stripe on live accounts. This is the demo.");
    setBusy(plan ?? fn + (flow ?? ""));
    try {
      const { data, error } = await supabase.functions.invoke(fn, { body: { flow, plan, interval } });
      if (error) throw error;
      if (!data?.url) throw new Error(data?.error ?? "Could not open billing");
      location.href = data.url as string;
    } catch (e) {
      let m = errMsg(e, "Could not open billing");
      try { const ctx = (e as { context?: Response }).context; if (ctx) m = (await ctx.json()).error ?? m; } catch { /* ignore */ }
      toast(m);
      setBusy(null);
    }
  }

  if (!me.isOwner) return <div className="empty">Only the account owner can manage billing.</div>;

  return (
    <div className="stack">
      <div className="page-head"><div><h1 className="page-title">Billing</h1><p className="page-sub">Your Quorra Dispatch plan.</p></div></div>

      {locked && <div className="error-banner" style={{ margin: 0 }}>Your plan is not active, so the rest of the app is locked. Start your free trial below to continue.</div>}

      <div className="card stack">
        <div className="row between wrap">
          <div>
            <div className="card-title" style={{ margin: 0 }}>Current plan</div>
            <div style={{ fontSize: 22, fontWeight: 800, marginTop: 6 }}>{planLabel}</div>
          </div>
          <span className={`badge ${sub?.comped ? "blue" : status === "active" ? "good" : status === "past_due" ? "bad" : "gray"}`}>
            {sub?.comped ? "Complimentary" : status === "active" ? (sub?.cancel_at_period_end ? "Cancels at period end" : sub?.trialing ? "Free trial" : "Active") : status === "past_due" ? "Payment failed" : status === "canceled" ? "Canceled" : "Not started"}
          </span>
        </div>
        {!sub?.comped && (
          <>
            {named && <div className="row between"><span className="muted">Includes</span><b>{named.seats} {named.seats === 1 ? "login" : "logins"}</b></div>}
            <div className="row between"><span className="muted">Charged</span><b className="num">{money(sub?.amount_cents ?? 0)} per {sub?.billing_interval ?? "month"}</b></div>
          </>
        )}
        {sub?.current_period_end && active && !sub.comped && (
          <div className="row between"><span className="muted">{sub.cancel_at_period_end ? "Access until" : sub.trialing ? "Free trial ends, first charge" : "Next payment"}</span><b>{new Date(sub.current_period_end).getFullYear() > 1971 ? fmtDate(sub.current_period_end) : "-"}</b></div>
        )}
        {status === "past_due" && <div className="notice">The last payment did not go through. Update your card to keep your access.</div>}
        {sub?.comped && <div className="small muted">This account is on a complimentary plan. No payment is needed.</div>}
      </div>

      {hasPlan && (
        <div className="card stack">
          <div className="card-title" style={{ margin: 0 }}>What you have been charged</div>
          {charges === null ? <div className="small muted">Loading...</div> : charges.length === 0 ? <div className="small muted">No charges yet. Your first one appears after your free trial ends.</div> : (
            <div className="list">
              {charges.map((c) => (
                <div key={c.id} className="list-item">
                  <div className="grow"><div className="title">{c.description}</div><div className="small muted">{fmtDate(c.date)}</div></div>
                  <div className="right"><b className="num">{money(c.amount_cents)}</b><br /><span className={`badge ${c.status === "paid" ? "good" : "bad"}`}>{c.status === "paid" ? "Paid" : c.status === "unpaid" ? "Unpaid" : c.status}</span></div>
                  {c.receipt_url && <a className="btn sm" href={c.receipt_url} target="_blank" rel="noreferrer">Receipt</a>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {!active && !sub?.comped ? (
        <div className="stack">
          <div className="card-title" style={{ margin: 0 }}>Choose your plan</div>
          <PlanCards backTo="/billing" busy={busy} cta="Start" onChoose={(p, iv) => void go("billing-checkout", undefined, p.id, iv)} />
        </div>
      ) : !sub?.comped && (
        <div className="card stack">
          <div className="card-title" style={{ margin: 0 }}>Manage your plan</div>
          <div className="pay-btns">
            <button className="btn" disabled={busy !== null} onClick={() => go("billing-portal")}>Update card and see receipts</button>
            {sub?.cancel_at_period_end ? (
              <button className="btn primary" disabled={busy !== null} onClick={async () => {
                setBusy("resume");
                try { const { error } = await supabase!.functions.invoke("billing-portal", { body: { flow: "resume" } }); if (error) throw error; toast("Plan resumed. It will keep renewing."); await refresh(); }
                catch (e) { toast(errMsg(e, "Could not resume your plan")); }
                finally { setBusy(null); }
              }}>Resume plan</button>
            ) : (
              <>
                <button className="btn" disabled={busy !== null} onClick={() => go("billing-portal", "update")}>Upgrade or downgrade</button>
                <button className="btn danger" disabled={busy !== null} onClick={() => setCancelOpen(true)}>Cancel plan</button>
              </>
            )}
          </div>
          <div className="small muted">These open Stripe's secure billing page. Cancelling keeps your access until the end of the period you already paid for.</div>
        </div>
      )}
      {cancelOpen && (
        <Sheet title="Cancel your plan" onClose={() => setCancelOpen(false)}>
          <div className="stack">
            <p className="small muted" style={{ margin: 0 }}>We are sorry to see you go. Please tell us why. It takes ten seconds and helps us fix problems. You keep access until the end of the period you already paid for.</p>
            <Field label="Why are you cancelling? (required)">
              <select className="select" value={why.reason} onChange={(e) => setWhy({ ...why, reason: e.target.value })}>
                <option value="">Choose a reason</option>
                {["Too expensive", "Missing a feature I need", "Too hard to use", "Something is not working right", "Switching to another product", "Closing or pausing my business", "Not using it enough", "Other"].map((r) => <option key={r}>{r}</option>)}
              </select>
            </Field>
            <Field label="Tell us more (optional)"><textarea className="textarea" rows={3} value={why.details} onChange={(e) => setWhy({ ...why, details: e.target.value })} placeholder="What went wrong or what would have kept you?" /></Field>
            <label className="row"><input type="checkbox" checked={why.contact} onChange={(e) => setWhy({ ...why, contact: e.target.checked })} /> Yes, please contact me about this problem</label>
            {why.contact && <Field label="Best phone number (we will also email you)"><input className="input" type="tel" value={why.phone} onChange={(e) => setWhy({ ...why, phone: e.target.value })} /></Field>}
            <button className="btn danger block" disabled={busy !== null} onClick={async () => {
              if (!why.reason) return toast("Please choose a reason");
              if (hasSupabase && supabase) {
                const { error } = await supabase.functions.invoke("cancel-feedback", { body: { reason: why.reason, details: why.details, contact_me: why.contact, phone: why.phone } });
                if (error) { let m = errMsg(error, "Could not send your feedback"); try { const ctx = (error as { context?: Response }).context; if (ctx) m = (await ctx.json()).error ?? m; } catch { /* ignore */ } return toast(m); }
              }
              setCancelOpen(false);
              void go("billing-portal", "cancel");
            }}>Continue to cancel</button>
            <button className="btn block" onClick={() => setCancelOpen(false)}>Keep my plan</button>
          </div>
        </Sheet>
      )}
    </div>
  );
}
