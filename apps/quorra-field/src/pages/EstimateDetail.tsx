import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useData } from "../lib/app";
import { invoiceTotals, lineTotal, money } from "../lib/money";
import { fmtDate } from "../lib/dates";
import { Icon, Spinner, useToast, useConfirm } from "../components/ui";
import { EstimateBadge } from "./Estimates";
import EstimateForm from "../components/EstimateForm";
import JobForm from "../components/JobForm";
import { buildPdf, savePdf } from "../lib/pdf";
import { openPrintable, renderTemplate } from "../lib/customHtml";
import { quoteUrl } from "../lib/publicLinks";
import SendSheet from "../components/SendSheet";
import PrintHeader from "../components/PrintHeader";
import type { EstimateStatus } from "../lib/types";

export default function EstimateDetail() {
  const { id } = useParams();
  const { loading, store, business, estimates, invoices, leads, customerById, refresh } = useData();
  const nav = useNavigate();
  const toast = useToast();
  const ask = useConfirm();
  const [editing, setEditing] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);

  if (loading) return <Spinner />;
  const est = estimates.find((e) => e.id === id);
  if (!est) return <div className="empty">Estimate not found. <Link to="/estimates" style={{ color: "var(--brand)" }}>Back to estimates</Link></div>;

  const customer = customerById(est.customer_id);
  const totals = invoiceTotals(est);

  async function setStatus(status: EstimateStatus, msg: string) {
    setBusy(true);
    try {
      await store.saveRow("estimates", { ...est!, status });
      // Keep the linked lead's pipeline stage in step with the quote.
      const lead = leads.find((l) => l.estimate_id === est!.id);
      const stage = status === "sent" ? "quote_sent" : status === "approved" ? "work_order" : status === "declined" ? "declined" : null;
      if (lead && stage) await store.saveRow("leads", { ...lead, stage });
      await refresh();
      toast(msg);
    } finally {
      setBusy(false);
    }
  }

  async function createInvoice() {
    setBusy(true);
    try {
      const inv = await store.saveInvoice({
        number: Math.max(1000, ...invoices.map((i) => i.number)) + 1,
        customer_id: est!.customer_id,
        job_id: est!.job_id,
        status: "draft",
        items: est!.items,
        tax_rate: est!.tax_rate,
        issued_at: new Date().toISOString(),
        due_at: new Date(Date.now() + 14 * 86400_000).toISOString(),
        qbo_id: null,
      });
      await store.saveRow("estimates", { ...est!, invoice_id: inv.id });
      await refresh();
      toast("Draft invoice created");
      nav(`/invoices/${inv.id}`);
    } finally {
      setBusy(false);
    }
  }

  const link = quoteUrl(est.public_token);
  const first = customer?.name.split(" ")[0] ?? "there";
  const subject = `Estimate #${est.number} from ${business.name}`;
  const body = `Hi ${first},\n\nYour estimate for ${est.title} is attached: ${money(totals.total)}, valid until ${fmtDate(est.valid_until)}.${link ? `\n\nView and accept it online: ${link}` : "\n\nReply to approve and we will schedule your service."}\n\nThank you,\n${business.name}${business.phone ? `\n${business.phone}` : ""}`;
  const makePdf = () => buildPdf({ kind: "Estimate", number: est.number, business, customer, items: est.items, tax_rate: est.tax_rate, issued: est.issued_at, dateLabel: "Valid until", dateValue: est.valid_until, notes: est.notes });

  return (
    <div className="stack">
      <PrintHeader title={`Estimate #${est.number}`} />
      <div className="page-head">
        <div>
          <Link to="/estimates" className="small muted bold no-print">← Estimates</Link>
          <h1 className="page-title" style={{ fontSize: 24 }}>{est.title}</h1>
          <p className="page-sub">#{est.number} · {customer?.name} · valid until {fmtDate(est.valid_until)}</p>
        </div>
        <EstimateBadge status={est.status} />
      </div>

      <div className="card">
        <div className="card-title">Scope &amp; pricing</div>
        {est.items.map((li, i) => (
          <div key={i} className="row between" style={{ padding: "8px 0", borderTop: i ? "1px solid var(--line)" : 0 }}>
            <div className="grow">
              <div className="bold">{li.description || "Item"}</div>
              <div className="small muted">{li.qty} × {money(li.unit_cents)}</div>
            </div>
            <div className="bold num">{money(lineTotal(li))}</div>
          </div>
        ))}
        <div className="totals">
          <div className="t muted"><span>Subtotal</span><span className="num">{money(totals.subtotal)}</span></div>
          <div className="t muted"><span>Tax ({est.tax_rate}%)</span><span className="num">{money(totals.tax)}</span></div>
          <div className="t grand"><span>Total</span><span className="num">{money(totals.total)}</span></div>
        </div>
        {est.notes && <p className="small" style={{ marginTop: 12, whiteSpace: "pre-wrap" }}>{est.notes}</p>}
      </div>

      <div className="card stack no-print">
        {est.status === "draft" && (
          <>
            <div className="notice">Send the quote to the customer by email or text with the PDF attached, then mark it as sent.</div>
            <button className="btn primary block" onClick={() => setSendOpen(true)}>{Icon.send} Send quote</button>
          </>
        )}
        {est.status === "sent" && (
          <>
            <div className="card-title" style={{ margin: 0 }}>Customer's answer</div>
            <div className="row wrap">
              <button className="btn good grow" disabled={busy} onClick={() => setStatus("approved", "Estimate approved")}>{Icon.check} Approved</button>
              <button className="btn danger grow" disabled={busy} onClick={() => setStatus("declined", "Marked declined")}>Declined</button>
              <button className="btn grow" onClick={() => setSendOpen(true)}>Resend</button>
            </div>
          </>
        )}
        {est.status === "declined" && <button className="btn" disabled={busy} onClick={() => setStatus("sent", "Reopened")}>Reopen as sent</button>}
        {est.status === "approved" && (
          <>
            <div className="card-title" style={{ margin: 0 }}>Next steps</div>
            <div className="row wrap">
              {est.job_id ? <Link className="btn grow" to={`/jobs/${est.job_id}`}>View job</Link> : <button className="btn primary grow" onClick={() => setScheduling(true)}>Schedule the job</button>}
              {est.invoice_id && invoices.some((i) => i.id === est.invoice_id) ? <Link className="btn grow" to={`/invoices/${est.invoice_id}`}>View invoice</Link> : <button className="btn grow" disabled={busy} onClick={createInvoice}>Create invoice</button>}
            </div>
          </>
        )}
      </div>

      <div className="row wrap no-print">
        <button className="btn grow" onClick={() => void savePdf(makePdf(), `Estimate-${est.number}.pdf`)}>Download PDF</button>
        <button className="btn grow" onClick={() => void savePdf(makePdf(), `Estimate-${est.number}.pdf`, true)}>Share PDF</button>
        {business.doc_settings?.custom_html && <button className="btn grow" onClick={() => openPrintable(renderTemplate(business.doc_settings!.custom_html!, { kind: "Estimate", number: est.number, business, customer, items: est.items, tax_rate: est.tax_rate, issued: est.issued_at, dateLabel: "Valid until", dateValue: est.valid_until, notes: est.notes }))}>Print custom layout</button>}
        {est.status !== "draft" && <button className="btn grow" onClick={() => setSendOpen(true)}>Email / Text</button>}
        <button className="btn grow" onClick={() => setEditing(true)}>Edit</button>
        <button className="btn grow" onClick={async () => { await store.saveRow("doc_templates", { kind: "estimate", name: est.title, trade: "", title: est.title, notes: est.notes, items: est.items, hours: 2 }); await refresh(); toast("Saved as a template"); }}>Save as template</button>
        <button className="btn danger grow" onClick={async () => { if (await ask({ title: "Delete this estimate?", message: "This cannot be undone.", confirmLabel: "Delete", danger: true })) { await store.deleteRow("estimates", est.id); await refresh(); nav("/estimates"); } }}>Delete</button>
      </div>

      {sendOpen && (
        <SendSheet title="Send quote" filename={`Estimate-${est.number}.pdf`} makePdf={makePdf} to={customer?.email} phone={customer?.phone} subject={subject} body={body}
          onConfirm={est.status === "draft" ? () => setStatus("sent", "Quote sent") : undefined} confirmLabel="I sent it, mark as sent" onClose={() => setSendOpen(false)} />
      )}
      {editing && <EstimateForm estimate={est} onClose={() => setEditing(false)} />}
      {scheduling && (
        <JobForm
          defaultCustomer={est.customer_id}
          defaultTitle={est.title}
          onClose={() => setScheduling(false)}
          onSaved={async (job) => {
            await store.saveRow("estimates", { ...est, job_id: job.id });
            const lead = leads.find((l) => l.estimate_id === est.id);
            if (lead) await store.saveRow("leads", { ...lead, job_id: job.id, stage: "work_order" });
            await refresh();
            nav(`/jobs/${job.id}`);
          }}
        />
      )}
    </div>
  );
}
