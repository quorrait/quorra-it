import { PLANS, EVERY_PLAN, TRIAL_DAYS, type Plan } from "../lib/plans";
import { money } from "../lib/money";

/** Plan comparison. Used on the public plans page and on the Billing screen. */
export default function PlanCards({ onChoose, current, busy, cta = "Choose" }: { onChoose(p: Plan): void; current?: string; busy?: string | null; cta?: string }) {
  return (
    <div className="stack">
      <div className="plan-grid">
        {PLANS.map((p) => (
          <div key={p.id} className={`plan${p.popular ? " pop" : ""}`}>
            {p.popular && <div className="plan-flag">Most popular</div>}
            <div className="plan-name">{p.name}</div>
            <div className="small muted">{p.tagline}</div>
            <div className="plan-price"><span className="num">{money(p.price_cents).replace(".00", "")}</span><span className="muted"> / month</span></div>
            <div className="small bold" style={{ color: "var(--brand-dark, #c2410c)" }}>{TRIAL_DAYS}-day free trial</div>
            <ul className="plan-list">{p.extras.map((x) => <li key={x}>{x}</li>)}</ul>
            <button className={`btn block ${p.popular ? "primary" : ""}`} disabled={busy !== null && busy !== undefined} onClick={() => onChoose(p)}>
              {current?.toLowerCase() === p.name.toLowerCase() ? "Your plan" : busy === p.id ? "One moment..." : cta === "Start" ? `Start ${TRIAL_DAYS}-day free trial` : `${cta} ${p.name}`}
            </button>
          </div>
        ))}
      </div>
      <div className="card">
        <div className="card-title">Every plan includes</div>
        <ul className="plan-list cols">{EVERY_PLAN.map((x) => <li key={x}>{x}</li>)}</ul>
      </div>
    </div>
  );
}
