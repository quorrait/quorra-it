import { useState } from "react";
import { useData } from "../lib/app";
import { money } from "../lib/money";
import { Field, Icon, Sheet, Spinner, useToast } from "../components/ui";
import { centsToStr, strToCents } from "../components/LineItems";
import type { PriceCategory, PriceItem } from "../lib/types";

const CATS: PriceCategory[] = ["Labor", "Material", "Service", "Equipment"];

function ItemForm({ item, onClose }: { item?: PriceItem; onClose(): void }) {
  const { store, refresh } = useData();
  const toast = useToast();
  const [f, setF] = useState({
    name: item?.name ?? "", description: item?.description ?? "", category: item?.category ?? ("Service" as PriceCategory),
    price: centsToStr(item?.unit_cents ?? 0), cost: centsToStr(item?.cost_cents ?? 0),
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  return (
    <Sheet title={item ? "Edit item" : "New price book item"} onClose={onClose}>
      <div className="stack">
        <Field label="Name"><input className="input" value={f.name} onChange={set("name")} /></Field>
        <Field label="Description"><input className="input" value={f.description} onChange={set("description")} /></Field>
        <Field label="Category"><select className="select" value={f.category} onChange={set("category")}>{CATS.map((c) => <option key={c}>{c}</option>)}</select></Field>
        <div className="grid2 stack-sm">
          <Field label="Customer price ($)"><input className="input" inputMode="decimal" value={f.price} onChange={set("price")} /></Field>
          <Field label="Your cost ($)"><input className="input" inputMode="decimal" value={f.cost} onChange={set("cost")} /></Field>
        </div>
        <button className="btn primary block" onClick={async () => {
          if (!f.name.trim()) return toast("Add a name");
          await store.saveRow("price_items", { id: item?.id, name: f.name.trim(), description: f.description, category: f.category, unit_cents: strToCents(f.price), cost_cents: strToCents(f.cost) });
          await refresh(); toast("Saved"); onClose();
        }}>Save</button>
        {item && <button className="btn danger block" onClick={async () => { if (confirm("Delete this item?")) { await store.deleteRow("price_items", item.id); await refresh(); onClose(); } }}>Delete</button>}
      </div>
    </Sheet>
  );
}

export default function PriceBook() {
  const { loading, priceItems } = useData();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<"all" | PriceCategory>("all");
  const [edit, setEdit] = useState<PriceItem | "new" | null>(null);
  if (loading) return <Spinner />;
  const rows = priceItems
    .filter((p) => (cat === "all" || p.category === cat) && (p.name + p.description).toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));
  return (
    <div className="stack">
      <div className="page-head">
        <div><h1 className="page-title">Price book</h1><p className="page-sub">Your standard services and parts. Pick them when building estimates and invoices.</p></div>
        <button className="btn primary" onClick={() => setEdit("new")}>{Icon.plus} Add item</button>
      </div>
      <input className="input" placeholder="Search price book..." value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="chips">
        {(["all", ...CATS] as const).map((c) => <button key={c} className={`chip${cat === c ? " on" : ""}`} onClick={() => setCat(c)}>{c === "all" ? "All" : c}</button>)}
      </div>
      <div className="card flush scroll-x">
        {rows.length === 0 ? <div className="empty">No items</div> : (
          <table className="tbl">
            <thead><tr><th>Item</th><th>Category</th><th className="r">Price</th><th className="r">Cost</th><th className="r">Margin</th></tr></thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} style={{ cursor: "pointer" }} onClick={() => setEdit(p)}>
                  <td><div className="bold">{p.name}</div><div className="small muted">{p.description}</div></td>
                  <td>{p.category}</td>
                  <td className="r num">{money(p.unit_cents)}</td>
                  <td className="r num">{money(p.cost_cents)}</td>
                  <td className="r num">{p.unit_cents ? `${Math.round(((p.unit_cents - p.cost_cents) / p.unit_cents) * 100)}%` : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {edit && <ItemForm item={edit === "new" ? undefined : edit} onClose={() => setEdit(null)} />}
    </div>
  );
}
