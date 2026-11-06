import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useData } from "../lib/app";
import { fmtDate, fmtTime } from "../lib/dates";
import { Icon, InvoiceBadge, JobBadge, Spinner, useToast } from "../components/ui";
import JobForm from "../components/JobForm";
import InvoiceForm from "../components/InvoiceForm";
import { invoiceTotals, isOverdue, money } from "../lib/money";
import { amountPaid } from "../lib/money";
import type { JobStatus } from "../lib/types";

export default function JobDetail() {
  const { id } = useParams();
  const { loading, store, jobs, invoices, payments, customerById, purchaseOrders, timeEntries, team, refresh, can } = useData();
  const nav = useNavigate();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [invoicing, setInvoicing] = useState(false);

  if (loading) return <Spinner />;
  const job = jobs.find((j) => j.id === id);
  if (!job) return <div className="empty">Job not found. <Link to="/jobs" style={{ color: "var(--brand)" }}>Back to jobs</Link></div>;

  const customer = customerById(job.customer_id);
  const jobInvoices = invoices.filter((i) => i.job_id === job.id && i.status !== "void");
  const maps = `https://maps.google.com/?q=${encodeURIComponent(job.address)}`;

  async function setStatus(status: JobStatus) {
    await store.saveJob({ ...job!, status });
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

      {job.status === "scheduled" && (
        <button className="btn dark block" style={{ minHeight: 54 }} onClick={() => setStatus("in_progress")}>Start job</button>
      )}
      {job.status === "in_progress" && (
        <button className="btn good block" style={{ minHeight: 54 }} onClick={() => setStatus("completed")}>{Icon.check} Mark complete</button>
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
        {jobInvoices.length === 0 && <div className="empty">No invoice yet{job.status === "completed" ? " — this job is done, so bill it." : "."}</div>}
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
        {job.status !== "canceled" && job.status !== "completed" && (
          <button className="btn danger grow" onClick={() => { if (confirm("Cancel this job?")) void setStatus("canceled"); }}>Cancel job</button>
        )}
        {can("settings") && <button className="btn danger grow" onClick={async () => { if (confirm("Delete this job permanently?")) { await store.deleteJob(job.id); await refresh(); nav("/jobs"); } }}>Delete</button>}
      </div>

      {editing && <JobForm job={job} onClose={() => setEditing(false)} />}
      {invoicing && <InvoiceForm jobId={job.id} customerId={job.customer_id} onClose={() => setInvoicing(false)} onSaved={(i) => nav(`/invoices/${i.id}`)} />}
    </div>
  );
}
