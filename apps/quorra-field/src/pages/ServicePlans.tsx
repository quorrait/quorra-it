import { useState } from "react";
import { useData } from "../lib/app";
import { money, moneyShort } from "../lib/money";
import { fmtDate, fromDateInput, addDays } from "../lib/dates";
import { Field, Icon, Sheet, Spinner, useToast, useConfirm } from "../components/ui";
import { centsToStr, strToCents } from "../components/LineItems";
import type { ServicePlan } from "../lib/types";

const addMonthsStr = (ymd: string, n: number) => {
  const d = new Date(`${ymd}T12:00:00`);
  d.setMonth(d.getMonth() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

function PlanForm({ plan, onClose }: { plan?: ServicePlan; onClose(): void }) {
  const { store, customers, refresh } = useData();
  const toast = useToast();
  const ask = useConfirm();
  const [f, setF] = useState({
    customer_id: plan?.customer_id ?? customers[0]?.id ?? "", name: plan?.name ?? "", visit_title: plan?.visit_title ?? "",
    price: centsToStr(plan?.price_cents ?? 0), interval: String(plan?.interval_months ?? 6),
    next_visit: plan?.next_visit ?? addMonthsStr(new Date().toISOString().slice(0, 10), 1), notes: plan?.notes ?? "",
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  return (
    <Sheet title={plan ? "Edit plan" : "New service plan"} onClose={onClose}>
      <div className="stack">
        <Field label="Customer"><select className="select" value={f.customer_id} onChange={set("customer_id")}>{customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
        <Field label="Plan name"><input className="input" value={f.name} onChange={set("name")} placeholder="HVAC Tune-Up Plan" /></Field>
        <Field label="Visit job title"><input className="input" value={f.visit_title} onChange={set("visit_title")} placeholder="Seasonal HVAC tune-up" /></Field>
        <div className="grid2 stack-sm">
          <Field label="Price per visit ($)"><input className="input" inputMode="decimal" value={f.price} onChange={set("price")} /></Field>
          <Field label="Every"><select className="select" value={f.interval} onChange={set("interval")}>{[1, 3, 6, 12].map((m) => <option key={m} value={m}>{m} month{m > 1 ? "s" : ""}</option>)}</select></Field>
        </div>
        <Field label="Next visit"><input className="input" type="date" value={f.next_visit} onChange={set("next_visit")} /></Field>
        <Field label="Notes"><textarea className="textarea" value={f.notes} onChange={set("notes")} /></Field>
        <button className="btn primary block" onClick={async () => {
          if (!f.customer_id || !f.name.trim()) return toast("Pick a customer and name the plan");
          await store.saveRow("service_plans", { id: plan?.id, customer_id: f.customer_id, name: f.name.trim(), visit_title: f.visit_title || f.name, price_cents: strToCents(f.price), interval_months: Number(f.interval), next_visit: f.next_visit, status: plan?.status ?? "active", notes: f.notes });
          await refresh(); toast("Plan saved"); onClose();
        }}>Save plan</button>
        {plan && <button className="btn danger block" onClick={async () => { if (await ask({ title: "Delete this plan?", message: "This cannot be undone.", confirmLabel: "Delete", danger: true })) { await store.deleteRow("service_plans", plan.id); await refresh(); onClose(); } }}>Delete</button>}
      </div>
    </Sheet>
  );
}

export default function ServicePlans() {
  const { loading, plans, customerById, store, refresh, invoices } = useData();
  const toast = useToast();
  const [edit, setEdit] = useState<ServicePlan | "new" | null>(null);
  if (loading) return <Spinner />;

  const active = plans.filter((p) => p.status === "active");
  const arr = active.reduce((s, p) => s + p.price_cents * (12 / p.interval_months), 0);
  const horizon = addDays(new Date(), 14).toISOString().slice(0, 10);
  const due = active.filter((p) => p.next_visit <= horizon);

  async function schedule(p: ServicePlan) {
    const c = customerById(p.customer_id);
    const start = new Date(`${p.next_visit}T09:00:00`);
    await store.saveJob({
      customer_id: p.customer_id, title: p.visit_title, description: `Service plan: ${p.name}`, address: c?.address ?? "",
      status: "scheduled", start_at: start.toISOString(), end_at: new Date(start.getTime() + 2 * 3600_000).toISOString(), assigned_to: "",
    });
    await store.saveRow("service_plans", { ...p, next_visit: addMonthsStr(p.next_visit, p.interval_months) });
  }

  async function generate(list: ServicePlan[]) {
    for (const p of list) await schedule(p);
    await refresh();
    toast(`${list.length} visit${list.length === 1 ? "" : "s"} scheduled`);
  }

  async function bill(p: ServicePlan) {
    const inv = await store.saveInvoice({
      number: Math.max(1000, ...invoices.map((i) => i.number)) + 1, customer_id: p.customer_id, job_id: null, status: "draft",
      items: [{ description: `${p.name} visit`, qty: 1, unit_cents: p.price_cents }], tax_rate: 0,
      issued_at: new Date().toISOString(), due_at: new Date(Date.now() + 14 * 86400_000).toISOString(), qbo_id: null,
    });
    await refresh();
    toast(`Draft invoice #${inv.number} created`);
  }

  return (
    <div className="stack">
      <div className="page-head">
        <div><h1 className="page-title">Service plans</h1><p className="page-sub">Recurring maintenance that keeps revenue steady.</p></div>
        <button className="btn primary" onClick={() => setEdit("new")}>{Icon.plus} New plan</button>
      </div>
      <div className="kpi-grid">
        <div className="kpi"><div className="lbl">Active plans</div><div className="val">{active.length}</div></div>
        <div className="kpi"><div className="lbl">Yearly recurring</div><div className="val num">{moneyShort(arr)}</div></div>
        <div className="kpi"><div className="lbl">Due in 14 days</div><div className="val">{due.length}</div></div>
        <div className="kpi"><div className="lbl">Paused</div><div className="val">{plans.filter((p) => p.status === "paused").length}</div></div>
      </div>
      {due.length > 0 && (
        <div className="notice row between wrap">
          <span>{due.length} visit{due.length > 1 ? "s are" : " is"} due soon.</span>
          <button className="btn primary" onClick={() => void generate(due)}>Schedule all due visits</button>
        </div>
      )}
      <div className="card flush">
        {plans.length === 0 && <div className="empty">No service plans yet</div>}
        <div className="list">
          {plans.map((p) => (
            <div key={p.id} className="list-item" style={{ alignItems: "flex-start" }}>
              <div className="grow" onClick={() => setEdit(p)} style={{ cursor: "pointer" }}>
                <div className="title">{p.name} {p.status !== "active" && <span className="badge gray">{p.status}</span>}</div>
                <div className="small muted">{customerById(p.customer_id)?.name} · every {p.interval_months} mo · next {fmtDate(fromDateInput(p.next_visit))}</div>
                <div className="row wrap" style={{ marginTop: 8 }}>
                  {p.status === "active" && <button className="btn sm" onClick={async (e) => { e.stopPropagation(); await generate([p]); }}>Schedule visit</button>}
                  <button className="btn sm" onClick={async (e) => { e.stopPropagation(); await bill(p); }}>Bill visit</button>
                  <button className="btn sm" onClick={async (e) => { e.stopPropagation(); await store.saveRow("service_plans", { ...p, status: p.status === "active" ? "paused" : "active" }); await refresh(); }}>{p.status === "active" ? "Pause" : "Resume"}</button>
                </div>
              </div>
              <div className="right bold num">{money(p.price_cents)}</div>
            </div>
          ))}
        </div>
      </div>
      {edit && <PlanForm plan={edit === "new" ? undefined : edit} onClose={() => setEdit(null)} />}
    </div>
  );
}
