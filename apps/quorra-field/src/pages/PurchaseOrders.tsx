import { useState } from "react";
import { useData } from "../lib/app";
import { lineTotal, money } from "../lib/money";
import { errMsg } from "../lib/errors";
import { fmtDate, fromDateInput, toDateInput } from "../lib/dates";
import { Field, Icon, Sheet, Spinner, useToast, useConfirm } from "../components/ui";
import { LineItemsEditor, type Row, rowsToItems, toRow } from "../components/LineItems";
import type { POStatus, PurchaseOrder } from "../lib/types";

const badge: Record<POStatus, string> = { draft: "gray", ordered: "blue", received: "good", canceled: "bad" };
const total = (po: PurchaseOrder) => po.items.reduce((s, i) => s + lineTotal(i), 0);

function POForm({ po, onClose }: { po?: PurchaseOrder; onClose(): void }) {
  const { store, jobs, purchaseOrders, customerById, refresh, business } = useData();
  const toast = useToast();
  const ask = useConfirm();
  const [vendor, setVendor] = useState(po?.vendor ?? "");
  const [jobId, setJobId] = useState(po?.job_id ?? "");
  const [rows, setRows] = useState<Row[]>(po ? po.items.map(toRow) : [{ description: "", qty: "1", price: "" }]);
  const [exp, setExp] = useState(po?.expected_at ? toDateInput(po.expected_at) : "");
  const [notes, setNotes] = useState(po?.notes ?? "");
  const vendors = business.vendors ?? [];
  const [adding, setAdding] = useState(false);
  const [saveVendor, setSaveVendor] = useState(true);
  return (
    <Sheet title={po ? `PO #${po.number}` : "New purchase order"} onClose={onClose}>
      <div className="stack">
        <Field label="Vendor">
          <div className="row" style={{ gap: 8 }}>
            <select className="select grow" value={vendors.some((v) => v.name === vendor) ? vendor : adding || vendor ? "__other" : ""} onChange={(e) => { if (e.target.value === "__other") { setAdding(true); setVendor(""); } else { setAdding(false); setVendor(e.target.value); } }}>
              <option value="">Choose a vendor</option>
              {vendors.map((v) => <option key={v.name} value={v.name}>{v.name}</option>)}
              <option value="__other">Other (type it)</option>
            </select>
            <button type="button" className="btn" aria-label="Add a new vendor" title="Add a new vendor" onClick={() => { setAdding(true); setVendor(""); }}>+</button>
          </div>
        </Field>
        {(adding || (vendor && !vendors.some((v) => v.name === vendor))) && (
          <>
            <Field label="Vendor name"><input className="input" value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="e.g. Ferguson, Home Depot" /></Field>
            <label className="check-row"><input type="checkbox" checked={saveVendor} onChange={(e) => setSaveVendor(e.target.checked)} /> Add to my vendor list for next time</label>
          </>
        )}
        <Field label="For job (optional)">
          <select className="select" value={jobId} onChange={(e) => setJobId(e.target.value)}>
            <option value="">No job</option>
            {[...jobs].sort((a, b) => b.start_at.localeCompare(a.start_at)).slice(0, 60).map((j) => <option key={j.id} value={j.id}>{j.title} · {customerById(j.customer_id)?.name}</option>)}
          </select>
        </Field>
        <LineItemsEditor rows={rows} setRows={setRows} useCost priceLabel="Cost" />
        <Field label="Expected delivery"><input className="input" type="date" value={exp} onChange={(e) => setExp(e.target.value)} /></Field>
        <Field label="Notes"><textarea className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        <button className="btn primary block" onClick={async () => {
          const items = rowsToItems(rows);
          if (!vendor.trim() || !items.length) return toast("Add a vendor and at least one item");
          try {
            if (saveVendor && !vendors.some((v) => v.name.toLowerCase() === vendor.trim().toLowerCase())) {
              try { await store.saveBusiness({ vendors: [...vendors, { name: vendor.trim() }] }); } catch { toast("PO saved, but the vendor list could not be updated"); }
            }
            await store.saveRow("purchase_orders", {
              id: po?.id, number: po?.number ?? Math.max(5000, ...purchaseOrders.map((p) => p.number)) + 1, vendor: vendor.trim(),
              job_id: jobId || null, status: po?.status ?? "draft", items, ordered_at: po?.ordered_at ?? new Date().toISOString(),
              expected_at: exp ? fromDateInput(exp) : null, notes,
            });
            await refresh(); toast("Saved"); onClose();
          } catch (e) { toast(errMsg(e, "Could not save the purchase order.")); }
        }}>Save purchase order</button>
        {po && <button className="btn danger block" onClick={async () => { if (await ask({ title: "Delete this purchase order?", message: "This cannot be undone.", confirmLabel: "Delete", danger: true })) { try { await store.deleteRow("purchase_orders", po.id); await refresh(); onClose(); } catch (e) { toast(errMsg(e, "Could not delete the purchase order.")); } } }}>Delete</button>}
      </div>
    </Sheet>
  );
}

export default function PurchaseOrders() {
  const { loading, purchaseOrders, jobs, store, refresh } = useData();
  const toast = useToast();
  const [edit, setEdit] = useState<PurchaseOrder | "new" | null>(null);
  if (loading) return <Spinner />;
  const rows = [...purchaseOrders].sort((a, b) => b.number - a.number);
  const open = purchaseOrders.filter((p) => p.status === "ordered");
  const setStatus = async (p: PurchaseOrder, status: POStatus) => { try { await store.saveRow("purchase_orders", { ...p, status }); await refresh(); } catch (e) { toast(errMsg(e, "Could not update the purchase order.")); } };
  return (
    <div className="stack">
      <div className="page-head">
        <div><h1 className="page-title">Purchase orders</h1><p className="page-sub">Track parts you order for jobs. Costs feed job profit.</p></div>
        <button className="btn primary" onClick={() => setEdit("new")}>{Icon.plus} New PO</button>
      </div>
      <div className="kpi-grid">
        <div className="kpi"><div className="lbl">On order</div><div className="val num">{money(open.reduce((s, p) => s + total(p), 0))}</div><div className="sub">{open.length} orders</div></div>
        <div className="kpi"><div className="lbl">Drafts</div><div className="val">{purchaseOrders.filter((p) => p.status === "draft").length}</div></div>
        <div className="kpi"><div className="lbl">Received</div><div className="val">{purchaseOrders.filter((p) => p.status === "received").length}</div></div>
        <div className="kpi"><div className="lbl">Total spend</div><div className="val num">{money(purchaseOrders.filter((p) => p.status !== "canceled").reduce((s, p) => s + total(p), 0))}</div></div>
      </div>
      <div className="card flush">
        {rows.length === 0 && <div className="empty">No purchase orders</div>}
        <div className="list">
          {rows.map((p) => (
            <div key={p.id} className="list-item" style={{ alignItems: "flex-start" }}>
              <div className="grow" style={{ cursor: "pointer" }} onClick={() => setEdit(p)}>
                <div className="title">PO #{p.number} · {p.vendor}</div>
                <div className="small muted">{p.job_id ? jobs.find((j) => j.id === p.job_id)?.title ?? "Job" : "No job"} · {fmtDate(p.ordered_at)}</div>
                <div className="row wrap" style={{ marginTop: 8 }} onClick={(e) => e.stopPropagation()}>
                  {p.status === "draft" && <button className="btn sm" onClick={() => setStatus(p, "ordered")}>Mark ordered</button>}
                  {p.status === "ordered" && <button className="btn sm" onClick={() => setStatus(p, "received")}>Mark received</button>}
                  {(p.status === "draft" || p.status === "ordered") && <button className="btn sm" onClick={() => setStatus(p, "canceled")}>Cancel</button>}
                </div>
              </div>
              <div className="right"><div className="bold num">{money(total(p))}</div><span className={`badge ${badge[p.status]}`}>{p.status}</span></div>
            </div>
          ))}
        </div>
      </div>
      {edit && <POForm po={edit === "new" ? undefined : edit} onClose={() => setEdit(null)} />}
    </div>
  );
}
