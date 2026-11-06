import { useEffect, useState } from "react";

/** A row of color circles, plus a rainbow ring that opens the full picker, plus a hex box. */
export default function ColorPick({ value, onChange, swatches, label }: { value: string; onChange: (hex: string) => void; swatches: string[]; label: string }) {
  const custom = !swatches.some((s) => s.toLowerCase() === value.toLowerCase());
  const [hex, setHex] = useState(value);
  useEffect(() => setHex(value), [value]);
  return (
    <div className="row wrap" style={{ alignItems: "center", gap: 10 }}>
      {swatches.map((c) => (
        <button key={c} type="button" aria-label={c} onClick={() => onChange(c)} style={{ width: 34, height: 34, borderRadius: "50%", background: c, border: !custom && value.toLowerCase() === c.toLowerCase() ? "3px solid var(--ink)" : "3px solid transparent", cursor: "pointer" }} />
      ))}
      <label className={`colorring${custom ? " on" : ""}`} aria-label={label} title="Pick any color">
        <span className="dot" style={{ background: custom ? value : "#fff" }}>{custom ? "" : "+"}</span>
        <input type="color" value={/^#[0-9a-f]{6}$/i.test(value) ? value : "#000000"} onChange={(e) => onChange(e.target.value)} />
      </label>
      <input className="input hexbox" value={hex} maxLength={7} aria-label={`${label} hex code`} onChange={(e) => { setHex(e.target.value); if (/^#[0-9a-f]{6}$/i.test(e.target.value)) onChange(e.target.value); }} />
    </div>
  );
}
