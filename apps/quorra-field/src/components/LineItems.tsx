import { useMemo, useState } from "react";
import { Sheet } from "./ui";
import { useData } from "../lib/app";
import type { LineItem, PriceCategory } from "../lib/types";
import { lineTotal, money } from "../lib/money";

export interface Row {
  description: string;
  qty: string;
  price: string;
}

export const centsToStr = (c: number) => (c / 100).toFixed(2);
export const strToCents = (s: string) => Math.round((parseFloat(s) || 0) * 100);
export const toRow = (li: LineItem): Row => ({ description: li.description, qty: String(li.qty), price: centsToStr(li.unit_cents) });
export const rowsToItems = (rows: Row[]): LineItem[] =>
  rows
    .filter((r) => r.description.trim() || strToCents(r.price))
    .map((r) => ({ description: r.description.trim(), qty: parseFloat(r.qty) || 0, unit_cents: strToCents(r.price) }));

const CATS: (PriceCategory | "All")[] = ["All", "Service", "Labor", "Material", "Equipment"];

/** Pick items from the price book. `useCost` adds your cost instead of the customer price (for purchase orders). */
export function PricePicker({ onPick, onClose, useCost }: { onPick(row: Row): void; onClose(): void; useCost?: boolean }) {
  const { priceItems } = useData();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<PriceCategory | "All">("All");
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return priceItems
      .filter((i) => (cat === "All" || i.category === cat) && (!t || `${i.name} ${i.description}`.toLowerCase().includes(t)))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [priceItems, q, cat]);

  return (
    <Sheet title="Price book" onClose={onClose}>
      <div className="stack">
        <input className="input" placeholder="Search items" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
        <div className="chips">
          {CATS.map((c) => <button key={c} className={`chip${cat === c ? " on" : ""}`} onClick={() => setCat(c)}>{c}</button>)}
        </div>
        <div className="card flush" style={{ maxHeight: "46vh", overflowY: "auto" }}>
          {shown.length === 0 && <div className="empty">{priceItems.length === 0 ? "Your price book is empty. Add items under Price Book." : "No matches"}</div>}
          <div className="list">
            {shown.map((i) => (
              <div key={i.id} className="list-item" onClick={() => { onPick({ description: i.name, qty: "1", price: centsToStr(useCost ? i.cost_cents : i.unit_cents) }); onClose(); }}>
                <div className="grow">
                  <div className="title">{i.name}</div>
                  <div className="small muted">{i.category}</div>
                </div>
                <div className="bold num">{money(useCost ? i.cost_cents : i.unit_cents)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Sheet>
  );
}

/** Pull the items of a purchase order onto a quote or invoice. */
function POPicker({ onPick, onClose }: { onPick(rows: Row[]): void; onClose(): void }) {
  const { purchaseOrders } = useData();
  return (
    <Sheet title="Add from a purchase order" onClose={onClose}>
      <div className="card flush" style={{ maxHeight: "50vh", overflowY: "auto" }}>
        {purchaseOrders.length === 0 && <div className="empty">No purchase orders yet.</div>}
        <div className="list">
          {purchaseOrders.map((po) => (
            <div key={po.id} className="list-item" onClick={() => { onPick(po.items.map(toRow)); onClose(); }}>
              <div className="grow">
                <div className="title">PO #{po.number} · {po.vendor || "No vendor"}</div>
                <div className="small muted">{po.items.length} item{po.items.length === 1 ? "" : "s"}. Prices are your cost, so adjust them for the customer.</div>
              </div>
              <div className="bold num">{money(po.items.reduce((t, i) => t + lineTotal(i), 0))}</div>
            </div>
          ))}
        </div>
      </div>
    </Sheet>
  );
}

export function LineItemsEditor({ rows, setRows, useCost, priceLabel = "Price" }: {
  rows: Row[];
  setRows(r: Row[]): void;
  useCost?: boolean;
  priceLabel?: string;
}) {
  const [picking, setPicking] = useState(false);
  const [poPick, setPoPick] = useState(false);
  const set = (i: number, patch: Partial<Row>) => setRows(rows.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  const blank = { description: "", qty: "1", price: "" };
  const isBlank = (r: Row) => !r.description.trim() && !r.price;

  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="li-row li-head small muted bold">
        <span>Item</span><span>Qty</span><span>{priceLabel}</span><span />
      </div>
      {rows.map((r, i) => (
        <div key={i} className="li-row">
          <input className="input" placeholder="Description" value={r.description} onChange={(e) => set(i, { description: e.target.value })} />
          <input className="input" inputMode="decimal" value={r.qty} onChange={(e) => set(i, { qty: e.target.value })} aria-label="Quantity" />
          <input className="input" inputMode="decimal" placeholder="0.00" value={r.price} onChange={(e) => set(i, { price: e.target.value })} aria-label="Unit price" />
          <button className="x" onClick={() => setRows(rows.length > 1 ? rows.filter((_, k) => k !== i) : [blank])} aria-label="Remove line">×</button>
        </div>
      ))}
      <div className="row wrap">
        <button className="btn sm" onClick={() => setRows([...rows, blank])}>+ Add line</button>
        <button className="btn sm" onClick={() => setPicking(true)}>+ From price book</button>
        {!useCost && <button className="btn sm" onClick={() => setPoPick(true)}>+ From PO</button>}
      </div>
      {poPick && <POPicker onClose={() => setPoPick(false)} onPick={(add) => setRows([...rows.filter((r) => !isBlank(r)), ...add])} />}
      {picking && (
        <PricePicker
          useCost={useCost}
          onClose={() => setPicking(false)}
          onPick={(row) => setRows([...rows.filter((r) => !isBlank(r)), row])}
        />
      )}
    </div>
  );
}
