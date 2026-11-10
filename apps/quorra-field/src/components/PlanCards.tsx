import { useState } from "react";
import { Link } from "react-router-dom";
import { PLANS, CUSTOM_PLAN, TRIAL_DAYS, ANNUAL_DISCOUNT, annualCents, type Interval, type Plan } from "../lib/plans";
import { money } from "../lib/money";

const ON = { background: "#ea580c", color: "#fff", borderColor: "#ea580c" } as const;
const OFF = { background: "#fff", color: "#0f172a" } as const;

/** Plan comparison. Used on the public plans page and on the Billing screen. */
export default function PlanCards({ onChoose, current, busy, cta = "Choose", backTo = "/plans", focus, initialInterval = "month" }: { onChoose(p: Plan, interval: Interval): void; current?: string; busy?: string | null; cta?: string; backTo?: string; focus?: string; initialInterval?: Interval }) {
  const [iv, setIv] = useState<Interval>(initialInterval);
  return (
    <div className="stack">
      <div className="chips" style={{ justifyContent: "center" }}>
        <button type="button" className="chip" style={iv === "month" ? ON : OFF} onClick={() => setIv("month")}>Monthly</button>
        <button type="button" className="chip" style={iv === "year" ? ON : OFF} onClick={() => setIv("year")}>Annual · save {ANNUAL_DISCOUNT}%</button>
      </div>
      <div className="plan-grid">
        {PLANS.map((p) => (
          <div key={p.id} className={`plan${p.popular ? " pop" : ""}${focus === p.id ? " plan-focus" : ""}`}>
            {p.popular && <div className="plan-flag">Most popular</div>}
            <div className="plan-name">{p.name}</div>
            <div className="small muted">{p.tagline}</div>
            {iv === "month"
              ? <div className="plan-price"><span className="num">{money(p.price_cents).replace(".00", "")}</span><span className="muted"> / month</span><div className="small muted" style={{ fontWeight: 400 }}>50% off your first 3 months</div></div>
              : <div className="plan-price"><span className="num">{money(annualCents(p)).replace(".00", "")}</span><span className="muted"> / year</span><div className="small muted" style={{ fontWeight: 400 }}>{money(Math.round(annualCents(p) / 12)).replace(".00", "")} / month, {ANNUAL_DISCOUNT}% off</div></div>}
            {cta === "Start" && <div className="small bold" style={{ color: "var(--brand-dark, #c2410c)" }}>{TRIAL_DAYS}-day free trial</div>}
            <ul className="plan-list">{p.extras.map((x) => <li key={x} className={x.endsWith(":") ? "plan-sub" : undefined}>{x}</li>)}</ul>
            <button className={`btn block ${p.popular ? "primary" : ""}`} disabled={busy !== null && busy !== undefined} onClick={() => onChoose(p, iv)}>
              {current?.toLowerCase() === p.name.toLowerCase() ? "Your plan" : busy === p.id ? "One moment..." : cta === "Start" ? `Start ${TRIAL_DAYS}-day free trial` : `${cta} ${p.name}`}
            </button>
          </div>
        ))}
      </div>
      <div className="card plan-custom">
        <div className="grow stack" style={{ gap: 4 }}>
          <div className="plan-name">{CUSTOM_PLAN.name}</div>
          <div className="small muted">{CUSTOM_PLAN.tagline}</div>
          <div className="plan-price"><span className="num">{money(PLANS[2].price_cents).replace(".00", "")}</span><span className="muted"> / month, 15 logins included</span></div>
          <div className="plan-price"><span className="num">+ {money(CUSTOM_PLAN.per_tech_cents).replace(".00", "")}</span><span className="muted"> / month per technician after 15</span></div>
          <ul className="plan-list">{CUSTOM_PLAN.extras.map((x) => <li key={x}>{x}</li>)}</ul>
        </div>
        <Link className="btn dark" to="/contact" state={{ back: backTo }}>Contact us</Link>
      </div>
    </div>
  );
}
