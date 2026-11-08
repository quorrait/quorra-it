import { EDITABLE, FEATURE_LABEL } from "../lib/access";
import type { Feature } from "../lib/access";

const GROUPS: { title: string; items: Feature[] }[] = [
  { title: "Work", items: ["calendar", "jobs", "leads", "estimates", "invoices", "customers"] },
  { title: "Money", items: ["money", "reports", "timesheets"] },
  { title: "Setup", items: ["pricebook", "templates", "import", "plans", "purchase_orders", "team", "settings"] },
];

/** A tidy set of on/off switches for which screens someone can open. */
export default function AccessEditor({ list, onChange }: { list: Feature[]; onChange(next: Feature[]): void }) {
  const toggle = (f: Feature, on: boolean) => onChange(on ? [...new Set([...list, f])] : list.filter((x) => x !== f));
  return (
    <div className="stack" style={{ gap: 14 }}>
      {GROUPS.map((g) => (
        <div key={g.title}>
          <div className="small muted" style={{ fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", marginBottom: 6 }}>{g.title}</div>
          <div className="access-grid">
            {g.items.filter((f) => EDITABLE.includes(f)).map((f) => (
              <label key={f} className={`access-item${list.includes(f) ? " on" : ""}`}>
                <span>{FEATURE_LABEL[f]}</span>
                <span className="switch"><input type="checkbox" checked={list.includes(f)} onChange={(e) => toggle(f, e.target.checked)} /><i /></span>
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
