import { useState } from "react";
import { useData } from "../lib/app";
import { money } from "../lib/money";
import { LIBRARY, type LibPack } from "../lib/library";
import { Field, Icon, Sheet, Spinner, useToast } from "../components/ui";
import { LineItemsEditor, type Row, rowsToItems, toRow } from "../components/LineItems";
import type { DocTemplate, TemplateKind } from "../lib/types";

const total = (t: DocTemplate) => t.items.reduce((s, i) => s + Math.round(i.qty * i.unit_cents), 0);

function TemplateForm({ tpl, kind, onClose }: { tpl?: DocTemplate; kind: TemplateKind; onClose(): void }) {
  const { store, refresh } = useData();
  const toast = useToast();
  const [name, setName] = useState(tpl?.name ?? "");
  const [title, setTitle] = useState(tpl?.title ?? "");
  const [notes, setNotes] = useState(tpl?.notes ?? "");
  const [hours, setHours] = useState(String(tpl?.hours ?? 2));
  const [trade, setTrade] = useState(tpl?.trade ?? "");
  const [rows, setRows] = useState<Row[]>(tpl ? tpl.items.map(toRow) : [{ description: "", qty: "1", price: "" }]);
  return (
    <Sheet title={tpl ? "Edit template" : kind === "estimate" ? "New estimate / invoice template" : "New job template"} onClose={onClose}>
      <div className="stack">
        <Field label="Template name"><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Water heater swap" /></Field>
        <Field label={kind === "estimate" ? "Default title" : "Default job title"}><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
        {kind === "estimate" && <LineItemsEditor rows={rows} setRows={setRows} />}
        {kind === "job" && (
          <Field label="Duration"><select className="select" value={hours} onChange={(e) => setHours(e.target.value)}>{[0.5, 1, 1.5, 2, 3, 4, 6, 8, 16].map((h) => <option key={h} value={h}>{h} hrs</option>)}</select></Field>
        )}
        <Field label={kind === "estimate" ? "Customer notes / terms" : "Job notes"}><textarea className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        <Field label="Trade (optional)"><input className="input" value={trade} onChange={(e) => setTrade(e.target.value)} placeholder="HVAC" /></Field>
        <button className="btn primary block" onClick={async () => {
          if (!name.trim()) return toast("Name the template");
          await store.saveRow("doc_templates", { id: tpl?.id, kind, name: name.trim(), trade, title, notes, items: kind === "estimate" ? rowsToItems(rows) : [], hours: Number(hours) || 2 });
          await refresh(); toast("Template saved"); onClose();
        }}>Save template</button>
        {tpl && <button className="btn danger block" onClick={async () => { if (confirm("Delete this template?")) { await store.deleteRow("doc_templates", tpl.id); await refresh(); onClose(); } }}>Delete</button>}
      </div>
    </Sheet>
  );
}

export default function Templates() {
  const { loading, docTemplates, priceItems, store, refresh } = useData();
  const toast = useToast();
  const [edit, setEdit] = useState<{ tpl?: DocTemplate; kind: TemplateKind } | null>(null);
  const [busy, setBusy] = useState(false);
  if (loading) return <Spinner />;

  async function addPack(p: LibPack, what: "items" | "templates" | "both") {
    setBusy(true);
    try {
      let a = 0, b = 0;
      if (what !== "templates") {
        const have = new Set(priceItems.map((x) => x.name.toLowerCase()));
        for (const it of p.items) if (!have.has(it.name.toLowerCase())) { await store.saveRow("price_items", { name: it.name, description: it.description, category: it.category, unit_cents: Math.round(it.price * 100), cost_cents: Math.round(it.cost * 100) }); a++; }
      }
      if (what !== "items") {
        const have = new Set(docTemplates.map((x) => x.name.toLowerCase()));
        for (const t of p.templates) if (!have.has(t.name.toLowerCase())) { await store.saveRow("doc_templates", { kind: t.kind, name: t.name, trade: p.trade, title: t.title, notes: t.notes, hours: t.hours, items: t.items.map((i) => ({ description: i.description, qty: i.qty, unit_cents: Math.round(i.price * 100) })) }); b++; }
      }
      await refresh();
      toast(`Added ${a} price book items and ${b} templates`);
    } catch (e) { toast(e instanceof Error ? e.message : "Could not add (is migration 0004 run?)"); }
    finally { setBusy(false); }
  }

  const est = docTemplates.filter((t) => t.kind === "estimate");
  const jobs = docTemplates.filter((t) => t.kind === "job");
  const Section = ({ title, kind, list }: { title: string; kind: TemplateKind; list: DocTemplate[] }) => (
    <div className="card flush">
      <div className="row between" style={{ padding: "14px 16px 6px" }}>
        <div className="card-title" style={{ margin: 0 }}>{title}</div>
        <button className="btn sm primary" onClick={() => setEdit({ kind })}>{Icon.plus} New</button>
      </div>
      {list.length === 0 && <div className="empty">None yet. Add a starter pack below or create your own.</div>}
      <div className="list">
        {list.map((t) => (
          <div key={t.id} className="list-item" onClick={() => setEdit({ tpl: t, kind })}>
            <div className="grow"><div className="title">{t.name}</div><div className="small muted">{t.trade ? `${t.trade} · ` : ""}{kind === "estimate" ? `${t.items.length} items` : `${t.hours} hrs`}</div></div>
            {kind === "estimate" && <div className="bold num">{money(total(t))}</div>}
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="stack">
      <div className="page-head"><div><h1 className="page-title">Templates</h1><p className="page-sub">Reusable estimates, invoices and jobs. Pick one when you create a new estimate, invoice or job.</p></div></div>
      <Section title="Estimate & invoice templates" kind="estimate" list={est} />
      <Section title="Job templates" kind="job" list={jobs} />

      <div className="card stack">
        <div className="card-title" style={{ margin: 0 }}>Starter library</div>
        <p className="small muted">One tap adds standard services, parts and ready-made templates for your trade. Prices are typical starting points, so edit them to match your rates. Items you already have are skipped.</p>
        {LIBRARY.map((p) => (
          <div key={p.trade} className="row between wrap" style={{ borderTop: "1px solid var(--line)", paddingTop: 10 }}>
            <div><div className="bold">{p.trade}</div><div className="small muted">{p.blurb} · {p.items.length} price items · {p.templates.length} templates</div></div>
            <button className="btn sm primary" disabled={busy} onClick={() => addPack(p, "both")}>Add pack</button>
          </div>
        ))}
      </div>
      {edit && <TemplateForm tpl={edit.tpl} kind={edit.kind} onClose={() => setEdit(null)} />}
    </div>
  );
}
