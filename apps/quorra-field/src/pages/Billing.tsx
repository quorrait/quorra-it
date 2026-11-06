import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useData } from "../lib/app";
import { hasSupabase, supabase } from "../lib/supabase";
import { fmtDate } from "../lib/dates";
import { money } from "../lib/money";
import { Spinner, useToast } from "../components/ui";
import PlanCards from "../components/PlanCards";
import { planByName } from "../lib/plans";

/** Plan, status and the buttons that hand off to Stripe for card, receipts, plan changes and cancelling. */
export default function Billing() {
  const { loading, subscription: sub, me, refresh, locked } = useData();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (params.get("subscribed")) { toast("Thanks. Your plan can take a few seconds to show as active."); setParams({}, { replace: true }); const t = [3000, 8000].map((ms) => setTimeout(() => void refresh(), ms)); void refresh(); return () => t.forEach(clearTimeout); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return <Spinner />;
  const status = sub?.status ?? "none";
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

      {locked && <div className="error-banner" style={{ margin: 0 }}>Your plan is not active, so the rest of the app is locked. Start your plan below to continue.</div>}

      <div className="card stack">
        <div className="row between wrap">
          <div>
            <div className="card-title" style={{ margin: 0 }}>Current plan</div>
            <div style={{ fontSize: 22, fontWeight: 800, marginTop: 6 }}>{sub?.plan ?? "Quorra Dispatch"}</div>
          </div>
          <span className={`badge ${sub?.comped ? "blue" : status === "active" ? "good" : status === "past_due" ? "bad" : "gray"}`}>
            {sub?.comped ? "Complimentary" : status === "active" ? (sub?.cancel_at_period_end ? "Cancels at period end" : "Active") : status === "past_due" ? "Payment failed" : status === "canceled" ? "Canceled" : "Not started"}
          </span>
        </div>
        {!sub?.comped && (
          <>
            {planByName(sub?.plan) && <div className="row between"><span className="muted">Includes</span><b>{planByName(sub?.plan)!.seats} {planByName(sub?.plan)!.seats === 1 ? "login" : "logins"}</b></div>}
            <div className="row between"><span className="muted">Price</span><b className="num">{money(sub?.amount_cents ?? 30000)} / {sub?.billing_interval ?? "month"}</b></div>
          </>
        )}
        {sub?.current_period_end && active && !sub.comped && (
          <div className="row between"><span className="muted">{sub.cancel_at_period_end ? "Access until" : "Next payment"}</span><b>{fmtDate(sub.current_period_end)}</b></div>
        )}
        {status === "past_due" && <div className="notice">The last payment did not go through. Update your card to keep your access.</div>}
        {sub?.comped && <div className="small muted">This account is on a complimentary plan. No payment is needed.</div>}
      </div>

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
