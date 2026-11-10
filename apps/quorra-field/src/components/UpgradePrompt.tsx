import { Link } from "react-router-dom";
import { FEATURE_PLAN, type GatedFeature } from "../lib/plans";
import { Icon } from "./ui";

/** Locked feature. Names the plan that includes it and opens Billing with that plan selected. */
export default function UpgradePrompt({ feature, title }: { feature: GatedFeature; title?: string }) {
  const plan = FEATURE_PLAN[feature];
  return (
    <div className="card stack upgrade-lock" data-testid="upgrade-prompt">
      <div className="upgrade-lock-icon" aria-hidden>{Icon.lock}</div>
      <h2 style={{ margin: 0 }}>{title ?? `Upgrade to ${plan.name}`}</h2>
      <p className="muted" style={{ margin: 0 }}>Upgrade to {plan.name} to use this. Anything you already saved stays, and it comes back when you upgrade.</p>
      <Link className="btn primary" to={`/billing?plan=${plan.id}`}>Upgrade to {plan.name}</Link>
    </div>
  );
}
