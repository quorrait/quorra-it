import { PLANS, CUSTOM_PLAN, EVERY_PLAN, TRIAL_DAYS, type Plan } from "../lib/plans";
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
      <div className="card plan-custom">
        <div className="grow stack" style={{ gap: 4 }}>
          <div className="plan-name">{CUSTOM_PLAN.name}</div>
          <div className="small muted">{CUSTOM_PLAN.tagline}</div>
          <div className="plan-price"><span className="num">{money(PLANS[2].price_cents).replace(".00", "")}</span><span className="muted"> / month, 15 logins included</span></div>
          <div className="plan-price"><span className="num">+ {money(CUSTOM_PLAN.per_tech_cents).replace(".00", "")}</span><span className="muted"> / month per technician after 15</span></div>
          <ul className="plan-list">{CUSTOM_PLAN.extras.map((x) => <li key={x}>{x}</li>)}</ul>
        </div>
        <a className="btn dark" href={`mailto:${CUSTOM_PLAN.contact_email}?subject=${encodeURIComponent("Quorra Dispatch custom plan")}&body=${encodeURIComponent("Hi, we have ___ technicians and would like a quote for a custom plan.")}`}>Contact us</a>
      </div>
      <div className="card">
        <div className="card-title">Every plan includes</div>
        <ul className="plan-list cols">{EVERY_PLAN.map((x) => <li key={x}>{x}</li>)}</ul>
      </div>
    </div>
  );
}
