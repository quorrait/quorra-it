import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useData } from "../lib/app";
import { fmtDate, fmtDuration, fmtTime, fmtVariance, quotedMinutes } from "../lib/dates";
import { Field, Icon, InvoiceBadge, JobBadge, Sheet, Spinner, useToast, useConfirm } from "../components/ui";
import JobForm from "../components/JobForm";
import InvoiceForm from "../components/InvoiceForm";
import { invoiceTotals, isOverdue, money } from "../lib/money";
import { buildIcs, downloadIcs } from "../lib/ics";
import { jobEvents } from "../lib/jobEvents";
import { amountPaid } from "../lib/money";
import type { JobStatus } from "../lib/types";
import { reviewRequest } from "../lib/review";

export default function JobDetail() {
  const { id } = useParams();
  const { loading, me, business, store, jobs, invoices, payments, customerById, purchaseOrders, timeEntries, team, refresh, can } = useData();
  const nav = useNavigate();
  const toast = useToast();
  const ask = useConfirm();
  const [editing, setEditing] = useState(false);
  const [invoicing, setInvoicing] = useState(false);
  const [timing, setTiming] = useState(false);
  const [hrs, setHrs] = useState("");
  const [mins, setMins] = useState("");

  if (loading) return <Spinner />;
  const job = jobs.find((j) => j.id === id);
  if (!job) return <div className="empty">Job not found. <Link to="/jobs" style={{ color: "var(--brand)" }}>Back to jobs</Link></div>;

  const customer = customerById(job.customer_id);
  const jobInvoices = invoices.filter((i) => i.job_id === job.id && i.status !== "void");
  const maps = `https://maps.google.com/?q=${encodeURIComponent(job.address)}`;

  const quoted = quotedMinutes(job);
  function openTiming() {
    // Suggest the time since Start job (rounded to 15 minutes), or the quoted time if it was never started.
    const since = job!.actual_minutes ?? (job!.started_at ? Math.max(15, Math.round((Date.now() - new Date(job!.started_at).getTime()) / 900000) * 15) : quoted);
    setHrs(String(Math.floor(since / 60))); setMins(String(since % 60));
    setTiming(true);
  }
  async function saveTime(complete: boolean) {
    const total = (parseInt(hrs || "0", 10) || 0) * 60 + (parseInt(mins || "0", 10) || 0);
    if (total <= 0) return toast("Enter the time it took");
    await store.saveJob({ ...job!, status: complete ? "completed" : job!.status, actual_minutes: total });
    await refresh();
    setTiming(false);
    toast(complete ? "Job completed" : "Time updated");
  }

  function where(): Promise<{ lat: number; lng: number } | null> {
    return new Promise((res) => {
      if (!navigator.geolocation) return res(null);
      navigator.geolocation.getCurrentPosition((p) => res({ lat: p.coords.latitude, lng: p.coords.longitude }), () => res(null), { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 });
    });
  }
  async function checkIn(kind: "en_route" | "arrived") {
    const pos = await where();
    const now = new Date().toISOString();
    const patch = kind === "en_route"
      ? { en_route_at: now, en_route_lat: pos?.lat ?? null, en_route_lng: pos?.lng ?? null }
      : { arrived_at: now, arrived_lat: pos?.lat ?? null, arrived_lng: pos?.lng ?? null };
    await store.saveJob({ ...job!, ...patch });
    await refresh();
    toast(pos ? (kind === "en_route" ? "On my way recorded with your location" : "Arrival recorded with your location") : (kind === "en_route" ? "On my way recorded (location not shared)" : "Arrival recorded (location not shared)"));
    if (kind === "en_route" && customer?.phone) {
      const who = me.name.split(" ")[0];
      const msg = `Hi ${customer.name.split(" ")[0]}, this is ${who} with ${business.name || "us"}. I'm on my way to ${job!.address || "your location"} now.`;
      if (await ask({ title: "Text the customer?", message: "Let them know you're on your way.", confirmLabel: "Send text", cancelLabel: "Not now" })) location.href = `sms:${customer.phone}?&body=${encodeURIComponent(msg)}`;
    }
  }

  async function setStatus(status: JobStatus) {
    await store.saveJob({ ...job!, status, ...(status === "in_progress" ? { started_at: new Date().toISOString() } : {}) });
    await refresh();
    toast(status === "completed" ? "Job completed" : status === "in_progress" ? "Job started" : "Status updated");
  }

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <Link to="/jobs" className="small muted bold">← Jobs</Link>
          <h1 className="page-title" style={{ fontSize: 24 }}>{job.title}</h1>
          <p className="page-sub">{fmtDate(job.start_at)} · {fmtTime(job.start_at)} – {fmtTime(job.end_at)}</p>
        </div>
        <JobBadge status={job.status} />
      </div>

      {(job.status === "scheduled" || job.status === "in_progress") && (
        <div className="card stack">
          <div className="card-title" style={{ margin: 0 }}>Arrival</div>
          <div className="grid2">
            <button className="btn" disabled={Boolean(job.en_route_at)} onClick={() => void checkIn("en_route")}>On my way</button>
            <button className="btn" disabled={Boolean(job.arrived_at)} onClick={() => void checkIn("arrived")}>I've arrived</button>
          </div>
          {(job.en_route_at || job.arrived_at) && (
            <div className="small muted">
              {job.en_route_at && <div>On the way since {fmtTime(job.en_route_at)}{job.en_route_lat != null && <> · <a href={`https://maps.google.com/?q=${job.en_route_lat},${job.en_route_lng}`} target="_blank" rel="noopener" style={{ color: "var(--brand)" }}>see location</a></>}</div>}
              {job.arrived_at && <div>Arrived {fmtTime(job.arrived_at)}{job.arrived_lat != null && <> · <a href={`https://maps.google.com/?q=${job.arrived_lat},${job.arrived_lng}`} target="_blank" rel="noopener" style={{ color: "var(--brand)" }}>see location</a></>}</div>}
            </div>
          )}
        </div>
      )}

      {job.status === "scheduled" && (
        <button className="btn dark block" style={{ minHeight: 54 }} onClick={() => setStatus("in_progress")}>Start job</button>
      )}
      {job.status === "in_progress" && (
        <button className="btn good block" style={{ minHeight: 54 }} onClick={openTiming}>{Icon.check} Mark complete</button>
      )}

      {(job.status === "completed" || job.status === "in_progress") && (
        <div className="card stack">
          <div className="row between">
            <div className="card-title" style={{ margin: 0 }}>Time on the job</div>
            {job.status === "completed" && <button className="btn sm" onClick={openTiming}>Edit time</button>}
          </div>
          <div className="grid2">
            <div className="kpi"><div className="lbl">Quoted</div><div className="val">{fmtDuration(quoted)}</div></div>
            <div className="kpi"><div className="lbl">Took</div><div className="val">{job.actual_minutes != null ? fmtDuration(job.actual_minutes) : "Not recorded"}</div></div>
          </div>
          {job.actual_minutes != null && <div className="small muted">{fmtVariance(job.actual_minutes, quoted)}</div>}
          {job.status === "completed" && customerById(job.customer_id) && (
            <div className="row wrap">
              <button className="btn" onClick={() => { const c = customerById(job.customer_id)!; const href = reviewRequest(business, c, "text"); if (!href) return toast("Add your Google review link in Settings first"); location.href = href; }}>Ask for a review (text)</button>
              <button className="btn" onClick={() => { const c = customerById(job.customer_id)!; const href = reviewRequest(business, c, "email"); if (!href) return toast("Add your Google review link in Settings first"); location.href = href; }}>Ask for a review (email)</button>
            </div>
          )}
        </div>
      )}

      {can("money") && (() => {
        const billed = jobInvoices.reduce((a, i) => a + invoiceTotals(i).total, 0);
        const paid = jobInvoices.reduce((a, i) => a + amountPaid(i.id, payments), 0);
        const mats = purchaseOrders.filter((p) => p.job_id === job.id && p.status !== "canceled").reduce((a, p) => a + p.items.reduce((b, li) => b + Math.round(li.qty * li.unit_cents), 0), 0);
        const labor = timeEntries.filter((t) => t.job_id === job.id && t.end_at).reduce((a, t) => a + Math.round(((new Date(t.end_at!).getTime() - new Date(t.start_at).getTime()) / 3600_000) * (team.find((m) => m.id === t.member_id)?.hourly_cents ?? 0)), 0);
        const profit = billed - mats - labor;
        return (
          <div className="card">
            <div className="card-title">Job profit</div>
            <div className="row between"><span className="muted">Billed</span><b className="num">{money(billed)}</b></div>
            <div className="row between"><span className="muted">Paid so far</span><b className="num">{money(paid)}</b></div>
            <div className="row between"><span className="muted">Materials (POs)</span><b className="num">-{money(mats)}</b></div>
            <div className="row between"><span className="muted">Labor (timesheets)</span><b className="num">-{money(labor)}</b></div>
            <div className="row between" style={{ borderTop: "1px solid var(--line)", marginTop: 8, paddingTop: 8 }}><b>Profit</b>{billed > 0 ? <b className="num" style={{ color: profit >= 0 ? "var(--good)" : "var(--bad)" }}>{money(profit)} ({Math.round((profit / billed) * 100)}%)</b> : <span className="small muted">Not billed yet</span>}</div>
          </div>
        );
      })()}

      <div className="card stack">
        <div className="card-title" style={{ margin: 0 }}>Customer</div>
        <div>
          <div className="bold" style={{ fontSize: 18 }}>{customer?.name}</div>
          <div className="small muted">{job.address}</div>
        </div>
        <div className="grid2">
          <a className="btn" href={`tel:${customer?.phone ?? ""}`}>{Icon.phone} Call</a>
          <a className="btn" href={maps} target="_blank" rel="noopener">{Icon.pin} Navigate</a>
        </div>
        {job.assigned_to && <div className="small muted">Assigned to <b>{job.assigned_to}</b></div>}
        {job.description && <p className="small" style={{ whiteSpace: "pre-wrap" }}>{job.description}</p>}
      </div>

      {can("invoices") && <div className="card flush">
        <div className="row between" style={{ padding: "16px 16px 8px" }}>
          <div className="card-title" style={{ margin: 0 }}>Invoices</div>
          <button className="btn sm primary" onClick={() => setInvoicing(true)}>{Icon.plus} Invoice</button>
        </div>
        {jobInvoices.length === 0 && <div className="empty">No invoice yet.{job.status === "completed" ? " This job is complete and ready to invoice." : ""}</div>}
        <div className="list">
          {jobInvoices.map((i) => (
            <div key={i.id} className="list-item" onClick={() => nav(`/invoices/${i.id}`)}>
              <div className="grow"><div className="title">Invoice #{i.number}</div></div>
              <div className="bold num">{money(invoiceTotals(i).total)}</div>
              <InvoiceBadge status={i.status} overdue={isOverdue(i, payments)} />
            </div>
          ))}
        </div>
      </div>}

      <div className="row wrap">
        <button className="btn grow" onClick={() => setEditing(true)}>Edit job</button>
        <button className="btn grow" onClick={() => downloadIcs(`${job.title}.ics`, buildIcs(job.title, jobEvents([job], customerById)))}>Add to phone calendar</button>
        {can("templates") && <button className="btn grow" onClick={async () => { await store.saveRow("doc_templates", { kind: "job", name: job.title, trade: "", title: job.title, notes: job.description, items: [], hours: Math.max(0.5, (new Date(job.end_at).getTime() - new Date(job.start_at).getTime()) / 3600_000) }); await refresh(); toast("Saved as a job template"); }}>Save as template</button>}
        {job.status !== "canceled" && job.status !== "completed" && (
          <button className="btn danger grow" onClick={async () => { if (await ask({ title: "Cancel this job?", message: "The job will be marked as canceled.", confirmLabel: "Cancel job", cancelLabel: "Keep job", danger: true })) void setStatus("canceled"); }}>Cancel job</button>
        )}
        {can("settings") && <button className="btn danger grow" onClick={async () => { if (await ask({ title: "Delete this job?", message: "This permanently removes the job and cannot be undone.", confirmLabel: "Delete job", danger: true })) { await store.deleteJob(job.id); await refresh(); nav("/jobs"); } }}>Delete</button>}
      </div>

      {editing && <JobForm job={job} onClose={() => setEditing(false)} />}
      {invoicing && <InvoiceForm jobId={job.id} customerId={job.customer_id} onClose={() => setInvoicing(false)} onSaved={(i) => nav(`/invoices/${i.id}`)} />}
      {timing && (
        <Sheet title={job.status === "completed" ? "Edit time on the job" : "How long did the job take?"} onClose={() => setTiming(false)}>
          <div className="stack">
            <div className="small muted">Quoted time: {fmtDuration(quoted)}</div>
            <div className="grid2 stack-sm">
              <Field label="Hours"><input className="input" inputMode="numeric" value={hrs} onChange={(e) => setHrs(e.target.value.replace(/\D/g, ""))} /></Field>
              <Field label="Minutes">
                <select className="select" value={mins} onChange={(e) => setMins(e.target.value)}>
                  {[0, 15, 30, 45].map((m) => <option key={m} value={m}>{m}</option>)}
                  {![0, 15, 30, 45].includes(Number(mins)) && <option value={mins}>{mins}</option>}
                </select>
              </Field>
            </div>
            <button className="btn good block" onClick={() => void saveTime(job.status !== "completed")}>{job.status === "completed" ? "Save time" : "Complete job"}</button>
          </div>
        </Sheet>
      )}
    </div>
  );
}
