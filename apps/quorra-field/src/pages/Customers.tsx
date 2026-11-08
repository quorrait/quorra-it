import { errMsg } from "../lib/errors";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useData } from "../lib/app";
import { Field, Icon, Sheet, Spinner, useConfirm, useToast } from "../components/ui";
import { isManager } from "../lib/access";
import type { Customer } from "../lib/types";
import { balanceDue, money } from "../lib/money";
import JobForm from "../components/JobForm";
import { portalPreviewUrl, portalUrl } from "../lib/publicLinks";

function CustomerForm({ customer, onClose }: { customer?: Customer; onClose(): void }) {
  const { store, refresh } = useData();
  const toast = useToast();
  const [f, setF] = useState({ name: customer?.name ?? "", phone: customer?.phone ?? "", email: customer?.email ?? "", address: customer?.address ?? "", notes: customer?.notes ?? "", flag: customer?.flag ?? "", flag_note: customer?.flag_note ?? "" });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f, v: string) => setF({ ...f, [k]: v });

  async function save() {
    if (!f.name.trim()) return toast("Add a name");
    if (f.flag && !f.flag_note.trim()) return toast("Add a note about what the problem was");
    setBusy(true);
    try {
      await store.saveCustomer({ id: customer?.id, ...f, flag: f.flag as "" | "caution" | "blocked", flag_note: f.flag ? f.flag_note.trim() : "", name: f.name.trim() });
      await refresh();
      toast(customer ? "Customer updated" : "Customer added");
      onClose();
    } catch (e) {
      toast(errMsg(e, "Could not save"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet title={customer ? "Edit customer" : "New customer"} onClose={onClose}>
      <div className="stack">
        <Field label="Name"><input className="input" value={f.name} onChange={(e) => set("name", e.target.value)} /></Field>
        <div className="grid2 stack-sm">
          <Field label="Phone"><input className="input" type="tel" value={f.phone} onChange={(e) => set("phone", e.target.value)} /></Field>
          <Field label="Email"><input className="input" type="email" value={f.email} onChange={(e) => set("email", e.target.value)} /></Field>
        </div>
        <Field label="Address"><input className="input" value={f.address} onChange={(e) => set("address", e.target.value)} /></Field>
        <Field label="Notes"><textarea className="textarea" value={f.notes} onChange={(e) => set("notes", e.target.value)} /></Field>
        <div className="opt-group">
          <h4>Flag this customer</h4>
          <Field label="Status">
            <select className="select" value={f.flag} onChange={(e) => set("flag", e.target.value)}>
              <option value="">No flag</option>
              <option value="caution">Caution (be careful)</option>
              <option value="blocked">Do not serve (blacklisted)</option>
            </select>
          </Field>
          {f.flag && <Field label="What was the problem? (required)"><textarea className="textarea" rows={3} value={f.flag_note} onChange={(e) => set("flag_note", e.target.value)} placeholder="Example: Bounced a check for invoice #1042 and was rude to the tech." /></Field>}
        </div>
        <button className="btn primary block" onClick={save} disabled={busy}>{busy ? "Saving..." : "Save"}</button>
      </div>
    </Sheet>
  );
}

export default function Customers() {
  const toast = useToast();
  const { loading, customers, jobs, invoices, payments, store, refresh, me } = useData();
  const ask = useConfirm();
  const flagBadge = (c: Customer) => c.flag === "blocked" ? <span className="badge bad">Do not serve</span> : c.flag === "caution" ? <span className="badge warn">Caution</span> : null;
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Customer | "new" | null>(null);
  const [scheduling, setScheduling] = useState<Customer | null>(null);
  const [open, setOpen] = useState<Customer | null>(null);

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return customers.filter((c) => !t || `${c.name} ${c.phone} ${c.address} ${c.email}`.toLowerCase().includes(t));
  }, [customers, q]);

  if (loading) return <Spinner />;

  const owed = (cid: string) => invoices.filter((i) => i.customer_id === cid && i.status === "sent").reduce((s, i) => s + balanceDue(i, payments), 0);

  return (
    <div className="stack">
      <div className="page-head">
        <h1 className="page-title">Customers</h1>
        <button className="btn primary" onClick={() => setEditing("new")}>{Icon.plus} Add</button>
      </div>
      <input className="input" placeholder="Search customers" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="card flush">
        {rows.length === 0 && <div className="empty">No customers found</div>}
        <div className="list">
          {rows.map((c) => (
            <div key={c.id} className="list-item" onClick={() => setOpen(c)}>
              <div className="grow">
                <div className="title">{c.name}</div>
                <div className="small muted">{c.address || c.phone}</div>
              </div>
              {flagBadge(c)}
              {owed(c.id) > 0 && <span className="badge warn">{money(owed(c.id))} due</span>}
            </div>
          ))}
        </div>
      </div>

      {open && (
        <Sheet title={open.name} onClose={() => setOpen(null)}>
          <div className="stack">
            <div className="small muted">{open.address}<br />{open.phone} {open.email && `· ${open.email}`}</div>
            {open.flag && (
              <div className={`notice ${open.flag === "blocked" ? "bad" : "warn"}`}>
                <b>{open.flag === "blocked" ? "Do not serve" : "Caution"}</b>
                <div className="small">{open.flag_note}</div>
              </div>
            )}
            {open.notes && <p className="small">{open.notes}</p>}
            <div className="grid2">
              <a className="btn" href={`tel:${open.phone}`}>{Icon.phone} Call</a>
              <button className="btn" onClick={async () => {
                if (open.flag === "blocked" && !(await ask({ title: "This customer is marked Do not serve", message: open.flag_note || "", confirmLabel: "Schedule anyway", cancelLabel: "Cancel", danger: true }))) return;
                setScheduling(open); setOpen(null);
              }}>{Icon.cal} Schedule job</button>
            </div>
            <div className="small muted bold">{jobs.filter((j) => j.customer_id === open.id).length} jobs · {invoices.filter((i) => i.customer_id === open.id).length} invoices · {money(owed(open.id))} outstanding</div>
            {portalUrl(open.portal_token) ? (
              <div className="stack" style={{ gap: 6 }}>
                <div className="bold small">Customer portal</div>
                <div className="small muted">A private page where {open.name.split(" ")[0]} can see quotes, accept them, view invoices and pay by card.</div>
                <div className="row wrap">
                  <button className="btn" onClick={async () => { try { await navigator.clipboard.writeText(portalUrl(open.portal_token)); toast("Portal link copied"); } catch { toast("Copy failed"); } }}>Copy link</button>
                  <a className="btn" href={`sms:${open.phone}?&body=${encodeURIComponent(`Here is your private page for quotes, invoices and payments: ${portalUrl(open.portal_token)}`)}`}>Text link</a>
                  <a className="btn" href={`mailto:${open.email}?subject=${encodeURIComponent("Your quotes and invoices")}&body=${encodeURIComponent(`Here is your private page for quotes, invoices and payments: ${portalUrl(open.portal_token)}`)}`}>Email link</a>
                </div>
              </div>
            ) : (
              <div className="stack" style={{ gap: 6 }}>
                <div className="bold small">Customer portal</div>
                <div className="small muted">On live accounts each customer gets a private link to see quotes, accept them, view invoices and pay by card. This is a sample of what they see.</div>
                <a className="btn" href={portalPreviewUrl()} target="_blank" rel="noreferrer">Preview customer portal</a>
              </div>
            )}
            <div className="row">
              <button className="btn grow" onClick={() => { setEditing(open); setOpen(null); }}>Edit</button>
              <button className="btn grow" onClick={() => { setOpen(null); nav("/invoices"); }}>Invoices</button>
            </div>
            {isManager(me.role) && (
              <button className="btn danger block" onClick={async () => {
                const n = jobs.filter((j) => j.customer_id === open.id).length, inv = invoices.filter((i) => i.customer_id === open.id).length;
                if (!(await ask({ title: `Delete ${open.name}?`, message: `This also deletes their ${n} job${n === 1 ? "" : "s"}, ${inv} invoice${inv === 1 ? "" : "s"} and quotes. It cannot be undone. To keep your records, flag them as Do not serve instead.`, confirmLabel: "Delete customer", danger: true }))) return;
                try { await store.deleteCustomer(open.id); await refresh(); toast("Customer deleted"); setOpen(null); } catch (e) { toast(errMsg(e, "Could not delete")); }
              }}>Delete customer</button>
            )}
          </div>
        </Sheet>
      )}
      {editing && <CustomerForm customer={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} />}
      {scheduling && <JobForm defaultCustomer={scheduling.id} onClose={() => setScheduling(null)} onSaved={(j) => nav(`/jobs/${j.id}`)} />}
    </div>
  );
}
