import { Field } from "./ui";

const QUICK = [0.5, 1, 2, 4, 8];

/** Job length: tap a common length, or type any hours and minutes. Value is decimal hours as a string. */
export default function DurationField({ value, onChange, label = "Duration" }: { value: string; onChange(v: string): void; label?: string }) {
  const total = Math.max(0, Math.round((parseFloat(value) || 0) * 60));
  const h = Math.floor(total / 60), m = total % 60;
  const set = (hh: number, mm: number) => onChange(String(+(hh + mm / 60).toFixed(4)));
  const num = (s: string, max: number) => Math.min(max, parseInt(s.replace(/\D/g, ""), 10) || 0);
  return (
    <Field label={label}>
      <div className="stack" style={{ gap: 8 }}>
        <div className="grid2 stack-sm">
          <div className="row" style={{ gap: 6 }}><input className="input" inputMode="numeric" aria-label="Hours" value={h} onChange={(e) => set(num(e.target.value, 99), m)} /><span className="muted">hr</span></div>
          <div className="row" style={{ gap: 6 }}><input className="input" inputMode="numeric" aria-label="Minutes" value={m} onChange={(e) => set(h, num(e.target.value, 59))} /><span className="muted">min</span></div>
        </div>
        <div className="row wrap" style={{ gap: 6 }}>
          {QUICK.map((q) => <button key={q} type="button" className={`chip${Math.abs((parseFloat(value) || 0) - q) < 0.001 ? " on" : ""}`} onClick={() => onChange(String(q))}>{q < 1 ? "30 min" : `${q} hr`}</button>)}
        </div>
      </div>
    </Field>
  );
}
