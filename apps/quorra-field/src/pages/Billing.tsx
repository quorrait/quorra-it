import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useData } from "../lib/app";
import { hasSupabase, supabase } from "../lib/supabase";
import { fmtDate } from "../lib/dates";
import { money } from "../lib/money";
import { Spinner, useToast } from "../components/ui";
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
  const [charges, setCharges] = useState<Charge[] | null>(null);

  useEffect(() => {
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

  async function go(fn: "billing-checkout" | "billing-portal", flow?: "cancel" | "update", plan?: string) {
    if (!hasSupabase || !supabase) return toast("Billing runs through Stripe on live accounts. This is the demo.");
    setBusy(plan ?? fn + (flow ?? ""));
    try {
      const { data, error } = await supabase.functions.invoke(fn, { body: { flow, plan } });
      if (error) throw error;
      if (!data?.url) throw new Error(data?.error ?? "Could not open billing");
      location.href = data.url as string;
    } catch (e) {
      let m = e instanceof Error ? e.message : "Could not open billing";
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
          <div className="row between"><span className="muted">{sub.cancel_at_period_end ? "Access until" : sub.trialing ? "Free trial ends, first charge" : "Next payment"}</span><b>{fmtDate(sub.current_period_end)}</b></div>
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
          <PlanCards busy={busy} cta="Start" onChoose={(p) => void go("billing-checkout", undefined, p.id)} />
        </div>
      ) : !sub?.comped && (
        <div className="card stack">
          <div className="card-title" style={{ margin: 0 }}>Manage your plan</div>
          <div className="pay-btns">
            <button className="btn" disabled={busy !== null} onClick={() => go("billing-portal")}>Update card and see receipts</button>
            <button className="btn" disabled={busy !== null} onClick={() => go("billing-portal", "update")}>Upgrade or downgrade</button>
            <button className="btn danger" disabled={busy !== null} onClick={() => go("billing-portal", "cancel")}>Cancel plan</button>
          </div>
          <div className="small muted">These open Stripe's secure billing page. Cancelling keeps your access until the end of the period you already paid for.</div>
        </div>
      )}
    </div>
  );
}
