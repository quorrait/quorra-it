import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useData } from "../lib/app";
import type { LineItem } from "../lib/types";
import { lineTotal } from "../lib/money";
import { RPP_SOURCE, STATE_NAMES, STATE_PRICE_LEVEL, localize, matchRefs, ownHistory, position } from "../lib/priceGuide";

const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

/** Shows what similar jobs usually cost, with the source of every figure. */
export default function PriceGuide({ title, items, estimateId }: { title: string; items: LineItem[]; estimateId?: string }) {
  const { business, estimates } = useData();
  const state = business.state?.toUpperCase() || "";
  const text = `${title} ${items.map((i) => i.description).join(" ")}`;
  const refs = useMemo(() => matchRefs(text), [text]);
  const subtotal = items.reduce((s, li) => s + lineTotal(li), 0) / 100;

  if (!refs.length) return null;

  return (
    <div className="card stack" style={{ background: "var(--bg-soft, #f8fafc)" }}>
      <div className="card-title" style={{ margin: 0 }}>Price guide{state ? ` for ${STATE_NAMES[state]}` : ""}</div>
      {!state && (
        <div className="notice">Add your state in <Link to="/settings" style={{ color: "var(--brand)" }}>Settings</Link> to adjust these national figures for your area.</div>
      )}
      {refs.map((r) => {
        const loc = localize(r, state);
        const mine = ownHistory(r, estimates, estimateId);
        const pos = !r.unit && subtotal > 0 ? position(subtotal, loc) : null;
        return (
          <div key={r.id} className="stack" style={{ gap: 6, borderTop: "1px solid var(--line)", paddingTop: 10 }}>
            <div className="row between">
              <div className="bold">{r.job}</div>
              {pos && <span className={`badge ${pos === "within" ? "good" : pos === "below" ? "blue" : "gray"}`}>{pos === "within" ? "Within typical range" : pos === "below" ? "Below typical range" : "Above typical range"}</span>}
            </div>
            <div>
              <span className="bold num">{usd(loc.low)} to {usd(loc.high)}{r.unit ? ` ${r.unit}` : ""}</span>
              {loc.avg !== null && <span className="muted small"> · average about {usd(loc.avg)}</span>}
            </div>
            {r.note && <div className="small muted">{r.note}</div>}
            {mine && (
              <div className="small">
                <span className="bold">Your past quotes ({mine.count}):</span> {mine.count === 1 ? `${usd(mine.avg)} before tax.` : `${usd(mine.low)} to ${usd(mine.high)}, average ${usd(mine.avg)} before tax.`}
              </div>
            )}
            <div className="small muted">
              Based on the national range of {usd(r.low)} to {usd(r.high)} from <a href={r.url} target="_blank" rel="noopener" style={{ color: "var(--brand)" }}>{r.source}</a> ({r.asOf})
              {state && STATE_PRICE_LEVEL[state] ? <>, adjusted by {STATE_NAMES[state]}'s price level of {STATE_PRICE_LEVEL[state].toFixed(1)} (US = 100) from the <a href={RPP_SOURCE.url} target="_blank" rel="noopener" style={{ color: "var(--brand)" }}>{RPP_SOURCE.name}</a></> : <>. No state is set, so no local adjustment is applied</>}.
            </div>
          </div>
        );
      })}
      <div className="small muted">Reference only. These are published averages scaled by state, not quotes from local competitors. Materials, access, permits and your own costs still decide the right price.</div>
    </div>
  );
}
