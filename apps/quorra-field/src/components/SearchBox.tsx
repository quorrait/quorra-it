/** Plain search field used above lists. */
export default function SearchBox({ value, onChange, placeholder }: { value: string; onChange(v: string): void; placeholder: string }) {
  return (
    <div style={{ position: "relative", marginBottom: 12 }}>
      <input className="input" type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} style={{ paddingLeft: 14, minHeight: 46 }} />
    </div>
  );
}

/** True when every word in the search appears in the text. Money is matched as 285, 285.00 or $285.00. */
export function searchHit(query: string, parts: (string | number | undefined | null)[], cents?: number): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const text = parts.filter((p) => p !== undefined && p !== null).join(" ").toLowerCase();
  const money = cents === undefined ? "" : ` ${(cents / 100).toFixed(2)} ${Math.round(cents / 100)} $${(cents / 100).toFixed(2)} ${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
  const hay = text + money;
  return q.split(/\s+/).every((w) => hay.includes(w.replace(/^\$/, "")));
}
