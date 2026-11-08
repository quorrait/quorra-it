import { FlagBanner, useBlockedGuard } from "./FlagBanner";
import DurationField from "./DurationField";
import { errMsg } from "../lib/errors";
import { useState } from "react";
import { Field, Sheet, useToast } from "./ui";
import { useData } from "../lib/app";
import type { Job } from "../lib/types";
import TemplatePicker from "./TemplatePicker";
import { addDays, fromLocalInput, snapTime, timeOptions, toInputDate, toLocalInput } from "../lib/dates";

const NEW = "__new__";

export default function JobForm({ job, defaultStart, defaultCustomer, defaultTitle, fromLead, onClose, onSaved }: {
  job?: Job;
  defaultStart?: Date;
  defaultCustomer?: string;
  defaultTitle?: string;
  fromLead?: boolean; // the caller already tracks this job as a lead

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
  const init = toLocalInput(start0.toISOString());
  const [date, setDate] = useState(init.slice(0, 10));
  const [time, setTime] = useState(snapTime(init.slice(11, 16)));
  const startLocal = `${date}T${time}`;
  const [hours, setHours] = useState(String(hrs0));
  const [allDay, setAllDay] = useState(false);
  const { business } = useData();
  function toggleAllDay(on: boolean) {
    setAllDay(on);
    if (!on) return;
    // Block the whole working day from the business hours (default 8 to 5).
    const dh = business.hours?.days?.[new Date(`${date}T12:00`).getDay()];
    const [sh, sm] = (dh?.open ? dh.start : "08:00").split(":").map(Number), [eh, em] = (dh?.open ? dh.end : "17:00").split(":").map(Number);
    setTime(`${String(sh).padStart(2, "0")}:${String(sm).padStart(2, "0")}`);
    setHours(String(+((eh * 60 + em - sh * 60 - sm) / 60).toFixed(2)));
  }
  const [assigned, setAssigned] = useState(job?.assigned_to ?? "");
  const [busy, setBusy] = useState(false);

  function pickCustomer(id: string) {
    setCustomerId(id);
    const c = customers.find((x) => x.id === id);
    if (c && !address) setAddress(c.address);
    if (c && address === customers.find((x) => x.id === customerId)?.address) setAddress(c.address);
  }

  const guard = useBlockedGuard();
  async function save() {
    if (!title.trim()) return toast("Add a job title");
    if (!job && !(await guard(customers.find((x) => x.id === customerId)))) return;
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
      if (!job && !fromLead) {
        // Every new job also appears in Leads as a work order, so everything is tracked in one place.
        const c = customers.find((x) => x.id === cid) ?? { name: newName.trim(), phone: newPhone.trim(), email: "", address };
        try {
          await store.saveRow("leads", { name: c.name, phone: c.phone, email: c.email, address: address || c.address, source: "Added job", service: title.trim(), value_cents: 0, stage: "work_order", notes: "", customer_id: cid, estimate_id: null, job_id: saved.id, created_at: new Date().toISOString() });
        } catch { /* the job itself is saved; the lead is a convenience */ }
      }
      await refresh();
      toast(job ? "Job updated" : "Job scheduled");
      onSaved?.(saved);
      onClose();
    } catch (e) {
      toast(errMsg(e, "Could not save"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet title={job ? "Edit job" : "New job"} onClose={onClose}>
      <div className="stack">
        {!job && <TemplatePicker kind="job" onPick={(t) => { setTitle(t.title || t.name); setDescription(t.notes); setHours(String(t.hours)); }} />}
        <FlagBanner c={customers.find((x) => x.id === customerId)} />
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
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. AC repair, water heater replacement" />
        </Field>
        <Field label="Address">
          <input className="input" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Job site address" />
        </Field>
        <Field label="Date">
          <input className="input" type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
          <div className="chips" style={{ marginTop: 8 }}>
            {([["Today", 0], ["Tomorrow", 1], ["In 1 week", 7]] as [string, number][]).map(([l, n]) => (
              <button key={l} type="button" className={`chip${date === toInputDate(addDays(new Date(), n)) ? " on" : ""}`} onClick={() => setDate(toInputDate(addDays(new Date(), n)))}>{l}</button>
            ))}
          </div>
        </Field>
        <div>
          <Field label="Start time">
            <select className="select" value={time} onChange={(e) => setTime(e.target.value)}>
              {timeOptions.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}
            </select>
          </Field>
        </div>
        <label className="check-row"><input type="checkbox" checked={allDay} onChange={(e) => toggleAllDay(e.target.checked)} /> All day (blocks your whole working day)</label>
        {!allDay && <DurationField value={hours} onChange={setHours} />}
        {allDay && <div className="small muted">Starts at {time} and runs {hours} hours. Uncheck to set a shorter job, or use a longer duration for multi-day work.</div>}
        <Field label="Assigned to">
          <select className="select" value={assigned} onChange={(e) => setAssigned(e.target.value)}>
            <option value="">Unassigned</option>
            {team.filter((t) => t.active && t.role !== "Office").map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
            {assigned && !team.some((t) => t.name === assigned && t.active) && <option value={assigned}>{assigned}</option>}
          </select>
        </Field>
        <Field label="Notes">
          <textarea className="textarea" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Access instructions, issue reported by the customer, parts needed" />
        </Field>
        <button className="btn primary block" onClick={save} disabled={busy}>{busy ? "Saving..." : job ? "Save changes" : "Schedule job"}</button>
      </div>
    </Sheet>
  );
}
