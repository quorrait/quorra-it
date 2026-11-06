import { useState } from "react";
import { Field, Sheet, useToast } from "./ui";
import { useData } from "../lib/app";
import type { Job } from "../lib/types";
import { fromLocalInput, toLocalInput } from "../lib/dates";

const NEW = "__new__";

export default function JobForm({ job, defaultStart, defaultCustomer, defaultTitle, onClose, onSaved }: {
  job?: Job;
  defaultStart?: Date;
  defaultCustomer?: string;
  defaultTitle?: string;
  onClose(): void;
  onSaved?(j: Job): void;
}) {
  const { store, customers, team, refresh } = useData();
  const toast = useToast();

  const start0 = job ? new Date(job.start_at) : defaultStart ?? (() => { const d = new Date(); d.setHours(d.getHours() + 1, 0, 0, 0); return d; })();
  const hrs0 = job ? Math.max(0.5, (new Date(job.end_at).getTime() - new Date(job.start_at).getTime()) / 3600_000) : 2;

  const [customerId, setCustomerId] = useState(job?.customer_id ?? defaultCustomer ?? NEW);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [title, setTitle] = useState(job?.title ?? defaultTitle ?? "");
  const [description, setDescription] = useState(job?.description ?? "");
  const [address, setAddress] = useState(job?.address ?? customers.find((c) => c.id === defaultCustomer)?.address ?? "");
  const [startLocal, setStartLocal] = useState(toLocalInput(start0.toISOString()));
  const [hours, setHours] = useState(String(hrs0));
  const [assigned, setAssigned] = useState(job?.assigned_to ?? "");
  const [busy, setBusy] = useState(false);

  function pickCustomer(id: string) {
    setCustomerId(id);
    const c = customers.find((x) => x.id === id);
    if (c && !address) setAddress(c.address);
    if (c && address === customers.find((x) => x.id === customerId)?.address) setAddress(c.address);
  }

  async function save() {
    if (!title.trim()) return toast("Add a job title");
    if (customerId === NEW && !newName.trim()) return toast("Add the customer's name");
    setBusy(true);
    try {
      let cid = customerId;
      if (cid === NEW) {
        const c = await store.saveCustomer({ name: newName.trim(), phone: newPhone.trim(), email: "", address, notes: "" });
        cid = c.id;
      }
      const startIso = fromLocalInput(startLocal);
      const endIso = new Date(new Date(startIso).getTime() + Number(hours) * 3600_000).toISOString();
      const saved = await store.saveJob({
        id: job?.id,
        customer_id: cid,
        title: title.trim(),
        description,
        address,
        status: job?.status ?? "scheduled",
        start_at: startIso,
        end_at: endIso,
        assigned_to: assigned.trim(),
      });
      await refresh();
      toast(job ? "Job updated" : "Job scheduled");
      onSaved?.(saved);
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet title={job ? "Edit job" : "New job"} onClose={onClose}>
      <div className="stack">
        <Field label="Customer">
          <select className="select" value={customerId} onChange={(e) => pickCustomer(e.target.value)}>
            <option value={NEW}>+ New customer</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        {customerId === NEW && (
          <div className="grid2 stack-sm">
            <Field label="Customer name"><input className="input" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Jane Smith" /></Field>
            <Field label="Phone"><input className="input" type="tel" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="(916) 555-0100" /></Field>
          </div>
        )}
        <Field label="Job title">
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="AC not cooling, water heater swap..." />
        </Field>
        <Field label="Address">
          <input className="input" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Job site address" />
        </Field>
        <div className="grid2 stack-sm">
          <Field label="Starts">
            <input className="input" type="datetime-local" value={startLocal} onChange={(e) => setStartLocal(e.target.value)} />
          </Field>
          <Field label="Duration">
            <select className="select" value={hours} onChange={(e) => setHours(e.target.value)}>
              {[0.5, 1, 1.5, 2, 3, 4, 6, 8].map((h) => <option key={h} value={h}>{h} hr{h === 1 ? "" : "s"}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Assigned to">
          <select className="select" value={assigned} onChange={(e) => setAssigned(e.target.value)}>
            <option value="">Unassigned</option>
            {team.filter((t) => t.active && t.role !== "Office").map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
            {assigned && !team.some((t) => t.name === assigned && t.active) && <option value={assigned}>{assigned}</option>}
          </select>
        </Field>
        <Field label="Notes">
          <textarea className="textarea" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Gate code, what the customer reported, parts needed..." />
        </Field>
        <button className="btn primary block" onClick={save} disabled={busy}>{busy ? "Saving..." : job ? "Save changes" : "Schedule job"}</button>
      </div>
    </Sheet>
  );
}
