import { useState } from "react";
import { useData } from "../lib/app";
import { moneyShort } from "../lib/money";
import { Field, Icon, Sheet, Spinner, useToast } from "../components/ui";
import { centsToStr, strToCents } from "../components/LineItems";
import EstimateForm from "../components/EstimateForm";
import type { Lead, LeadStage } from "../lib/types";

const STAGES: [LeadStage, string][] = [
  ["new", "New"], ["contacted", "Contacted"], ["quoted", "Quoted"], ["won", "Won"], ["lost", "Lost"],
];
const SOURCES = ["Google", "Referral", "Yelp", "Facebook", "Nextdoor", "Website", "Repeat customer", "Other"];

function LeadForm({ lead, onClose }: { lead?: Lead; onClose(): void }) {
  const { store, customers, refresh } = useData();
  const toast = useToast();
  const [f, setF] = useState({
    name: lead?.name ?? "", phone: lead?.phone ?? "", email: lead?.email ?? "", address: lead?.address ?? "",
    source: lead?.source ?? "Google", service: lead?.service ?? "", value: centsToStr(lead?.value_cents ?? 0),
    stage: lead?.stage ?? ("new" as LeadStage), notes: lead?.notes ?? "",
  });
  const [estimating, setEstimating] = useState<{ customerId: string; title: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  async function save(stage = f.stage, customer_id = lead?.customer_id ?? null) {
    if (!f.name.trim()) { toast("Add a name"); return null; }
    setBusy(true);
    try {
      const saved = await store.saveRow("leads", {
        id: lead?.id, name: f.name.trim(), phone: f.phone, email: f.email, address: f.address, source: f.source,
        service: f.service, value_cents: strToCents(f.value), stage, notes: f.notes, customer_id,
        created_at: lead?.created_at ?? new Date().toISOString(),
      });
      await refresh();
      return saved;
    } catch (e) { toast(e instanceof Error ? e.message : "Could not save"); return null; }
    finally { setBusy(false); }
  }

  async function makeEstimate() {
    let cid = lead?.customer_id ?? customers.find((c) => c.name.toLowerCase() === f.name.trim().toLowerCase())?.id;
    if (!f.name.trim()) return toast("Add a name");
    if (!cid) {
      const c = await store.saveCustomer({ name: f.name.trim(), phone: f.phone, email: f.email, address: f.address, notes: "" });
      cid = c.id;
    }
    const saved = await save(f.stage === "new" || f.stage === "contacted" ? "quoted" : f.stage, cid);
    if (saved) setEstimating({ customerId: cid, title: f.service });
  }

  if (estimating) return <EstimateForm customerId={estimating.customerId} title={estimating.title} onClose={onClose} />;

  return (
    <Sheet title={lead ? "Lead" : "New lead"} onClose={onClose}>
      <div className="stack">
        <Field label="Name"><input className="input" value={f.name} onChange={set("name")} /></Field>
        <div className="grid2 stack-sm">
          <Field label="Phone"><input className="input" type="tel" value={f.phone} onChange={set("phone")} /></Field>
          <Field label="Email"><input className="input" type="email" value={f.email} onChange={set("email")} /></Field>
        </div>
        <Field label="Address"><input className="input" value={f.address} onChange={set("address")} /></Field>
        <Field label="What do they need?"><input className="input" value={f.service} onChange={set("service")} placeholder="AC replacement, panel upgrade..." /></Field>
        <div className="grid2 stack-sm">
          <Field label="Est. value ($)"><input className="input" inputMode="decimal" value={f.value} onChange={set("value")} /></Field>
          <Field label="Source">
            <select className="select" value={f.source} onChange={set("source")}>{SOURCES.map((s) => <option key={s}>{s}</option>)}</select>
          </Field>
        </div>
        <Field label="Stage">
          <select className="select" value={f.stage} onChange={set("stage")}>{STAGES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        </Field>
        <Field label="Notes"><textarea className="textarea" value={f.notes} onChange={set("notes")} /></Field>
        <button className="btn primary block" disabled={busy} onClick={async () => { if (await save()) { toast("Lead saved"); onClose(); } }}>Save lead</button>
        <button className="btn block" disabled={busy} onClick={makeEstimate}>Create estimate</button>
        {lead && <button className="btn danger block" onClick={async () => { if (confirm("Delete this lead?")) { await store.deleteRow("leads", lead.id); await refresh(); onClose(); } }}>Delete</button>}
      </div>
    </Sheet>
  );
}

export default function Leads() {
  const { loading, leads, store, refresh } = useData();
  const [edit, setEdit] = useState<Lead | "new" | null>(null);
  const [over, setOver] = useState<LeadStage | null>(null);

  if (loading) return <Spinner />;

  async function move(id: string, stage: LeadStage) {
    const l = leads.find((x) => x.id === id);
    if (!l || l.stage === stage) return;
    await store.saveRow("leads", { ...l, stage });
    await refresh();
  }

  const open = leads.filter((l) => !["won", "lost"].includes(l.stage));
  const won = leads.filter((l) => l.stage === "won");
  const lost = leads.filter((l) => l.stage === "lost");
  const rate = won.length + lost.length ? Math.round((won.length / (won.length + lost.length)) * 100) : null;
  const sum = (a: Lead[]) => a.reduce((s, l) => s + l.value_cents, 0);

  return (
    <div className="stack">
      <div className="page-head">
        <div><h1 className="page-title">Leads</h1><p className="page-sub">Drag cards between stages, or tap one to edit.</p></div>
        <button className="btn primary" onClick={() => setEdit("new")}>{Icon.plus} New lead</button>
      </div>
      <div className="kpi-grid">
        <div className="kpi"><div className="lbl">Open pipeline</div><div className="val num">{moneyShort(sum(open))}</div><div className="sub">{open.length} leads</div></div>
        <div className="kpi"><div className="lbl">Won</div><div className="val num">{moneyShort(sum(won))}</div><div className="sub">{won.length} leads</div></div>
        <div className="kpi"><div className="lbl">Lost</div><div className="val num">{moneyShort(sum(lost))}</div><div className="sub">{lost.length} leads</div></div>
        <div className="kpi"><div className="lbl">Win rate</div><div className="val">{rate === null ? "-" : `${rate}%`}</div><div className="sub">won vs lost</div></div>
      </div>
      <div className="pipe">
        {STAGES.map(([stage, label]) => {
          const col = leads.filter((l) => l.stage === stage);
          return (
            <div key={stage} className={`pipe-col${over === stage ? " over" : ""}`}
              onDragOver={(e) => { e.preventDefault(); setOver(stage); }}
              onDragLeave={() => setOver(null)}
              onDrop={(e) => { e.preventDefault(); setOver(null); void move(e.dataTransfer.getData("text/plain"), stage); }}>
              <div className="pipe-head"><b>{label}</b><span className="small muted">{col.length} · {moneyShort(sum(col))}</span></div>
              {col.map((l) => (
                <div key={l.id} className="lead" draggable onDragStart={(e) => e.dataTransfer.setData("text/plain", l.id)} onClick={() => setEdit(l)}>
                  <div className="bold">{l.name}</div>
                  <div className="small muted">{l.service || "No details"}</div>
                  <div className="row between" style={{ marginTop: 6 }}>
                    <span className="small muted">{l.source}</span>
                    <span className="bold num">{moneyShort(l.value_cents)}</span>
                  </div>
                  <select className="select" style={{ marginTop: 8, height: 34, fontSize: 13 }} value={l.stage}
                    onClick={(e) => e.stopPropagation()} onChange={(e) => void move(l.id, e.target.value as LeadStage)}>
                    {STAGES.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
                  </select>
                </div>
              ))}
              {col.length === 0 && <div className="small muted" style={{ textAlign: "center", padding: 16 }}>Empty</div>}
            </div>
          );
        })}
      </div>
      {edit && <LeadForm lead={edit === "new" ? undefined : edit} onClose={() => setEdit(null)} />}
    </div>
  );
}
