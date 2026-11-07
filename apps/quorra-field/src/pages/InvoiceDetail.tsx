import { errMsg } from "../lib/errors";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useData } from "../lib/app";
import { amountPaid, balanceDue, invoiceTotals, isOverdue, lineTotal, money } from "../lib/money";
import { fmtDate } from "../lib/dates";
import type { InvoiceStatus } from "../lib/types";
import { portalPreviewUrl, portalUrl } from "../lib/publicLinks";
import { buildDocPdf, savePdf } from "../lib/pdf";
import { openPrintable, renderTemplate } from "../lib/customHtml";
import { Icon, InvoiceBadge, Spinner, useToast, useConfirm } from "../components/ui";
import InvoiceForm from "../components/InvoiceForm";
import SendSheet from "../components/SendSheet";
import { isManager } from "../lib/access";
import { CardPaySheet, ManualPaySheet, TakePaymentSheet } from "../components/PaySheet";

export default function InvoiceDetail() {
  const { id } = useParams();
  const { loading, store, business, invoices, payments, customerById, refresh, me } = useData();
  const nav = useNavigate();
  const toast = useToast();
  const ask = useConfirm();
  const [editing, setEditing] = useState(false);
  const [cardOpen, setCardOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [takeOpen, setTakeOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [params, setParams] = useSearchParams();

  // Returning from Stripe Checkout: the webhook records the payment a moment later.
  useEffect(() => {
    if (!params.get("paid")) return;
    toast("Payment received. It can take a few seconds to show up.");
    setParams({}, { replace: true });
    const t = [2000, 5000].map((ms) => setTimeout(() => void refresh(), ms));
    void refresh();
    return () => t.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return <Spinner />;
  const inv = invoices.find((i) => i.id === id);
  if (!inv) return <div className="empty">Invoice not found. <Link to="/invoices" style={{ color: "var(--brand)" }}>Back to invoices</Link></div>;

  const customer = customerById(inv.customer_id);
  const totals = invoiceTotals(inv);
  const paid = amountPaid(inv.id, payments);
  const balance = balanceDue(inv, payments);
  const myPayments = payments.filter((p) => p.invoice_id === inv.id).sort((a, b) => b.paid_at.localeCompare(a.paid_at));
  const canCollect = (inv.status === "sent" || inv.status === "draft") && balance > 0;

  async function setStatus(status: InvoiceStatus, msg: string) {
    setBusy(true);
    try {
      await store.saveInvoice({ ...inv!, status });
      await refresh();
      toast(msg);
    } catch (e) {
      toast(errMsg(e, "Could not update"));
    } finally {
      setBusy(false);
    }
  }

  async function sync() {
    setBusy(true);
    try {
      const r = await store.qboSyncInvoice(inv!.id);
      await refresh();
      toast(`Synced to QuickBooks (#${r.qbo_id})`);
    } catch (e) {
      toast(errMsg(e, "QuickBooks sync failed"));
    } finally {
      setBusy(false);
    }
  }

  const first = customer?.name.split(" ")[0] ?? "there";
  const subject = `Invoice #${inv.number} from ${business.name}`;
  const body = `Hi ${first},\n\nYour invoice #${inv.number} is attached. Balance due: ${money(balance)}, due ${fmtDate(inv.due_at)}.\n\nThank you,\n${business.name}${business.phone ? `\n${business.phone}` : ""}`;
  const makePdf = () => buildDocPdf({ kind: "Invoice", number: inv.number, business, customer, items: inv.items, tax_rate: inv.tax_rate, issued: inv.issued_at, dateLabel: "Due", dateValue: inv.due_at, paid, notes: inv.notes });

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <Link to="/invoices" className="small muted bold">← Invoices</Link>
          <h1 className="page-title">Invoice #{inv.number}</h1>
          <p className="page-sub">{customer?.name} · issued {fmtDate(inv.issued_at)}</p>
        </div>
        <InvoiceBadge status={inv.status} overdue={isOverdue(inv, payments)} partial={paid > 0 && paid < totals.total} />
      </div>

      <div className="card">
        <div className="card-title">Items</div>
        {inv.items.map((li, i) => (
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
          <div className="t muted"><span>Tax ({inv.tax_rate}%)</span><span className="num">{money(totals.tax)}</span></div>
          <div className="t grand"><span>Total</span><span className="num">{money(totals.total)}</span></div>
          {paid > 0 && <div className="t muted"><span>Paid</span><span className="num">−{money(paid)}</span></div>}
          {paid > 0 && <div className="t bold"><span>Balance due</span><span className="num">{money(balance)}</span></div>}
        </div>
      </div>

      {canCollect && (
        <div className="card">
          <div className="card-title">Take payment · {money(balance)}</div>
          <button className="btn primary block" style={{ minHeight: 56 }} onClick={() => setTakeOpen(true)}>{Icon.card} Take payment</button>
        </div>
      )}

      {inv.status !== "draft" && (
        <div className="card stack">
          <div className="card-title" style={{ margin: 0 }}>Send to customer</div>
          <div className="pay-btns">
            <button className="btn" onClick={() => setSendOpen(true)}>{Icon.send} Send (PDF, portal link or text)</button>
            <button className="btn" onClick={async () => void savePdf(await makePdf(), `Invoice-${inv.number}.pdf`)}>Download PDF</button>
          </div>
        </div>
      )}

      {inv.status === "draft" && (
        <div className="card stack">
          <div className="notice">This invoice is a draft. Send it to the customer when it is ready.</div>
          <div className="row wrap">
            <button className="btn primary grow" onClick={() => setSendOpen(true)}>{Icon.send} Send invoice</button>
            <button className="btn grow" onClick={() => setEditing(true)}>Edit</button>
          </div>
        </div>
      )}

      {myPayments.length > 0 && (
        <div className="card flush">
          <div className="card-title" style={{ padding: "16px 16px 0" }}>Payments</div>
          <div className="list">
            {myPayments.map((p) => (
              <div key={p.id} className="list-item" style={{ cursor: "default" }}>
                <div className="grow">
                  <div className="title" style={{ textTransform: "capitalize" }}>{p.method}</div>
                  <div className="small muted">{fmtDate(p.paid_at)}</div>
                </div>
                <div className="bold num" style={{ color: "var(--good)" }}>{money(p.amount_cents)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card stack">
        <div className="card-title" style={{ margin: 0 }}>QuickBooks</div>
        {!business.qbo_connected ? (
          <p className="small muted">Connect QuickBooks in <Link to="/settings" style={{ color: "var(--brand)", fontWeight: 700 }}>Settings</Link> to send invoices and payments over automatically.</p>
        ) : inv.qbo_id ? (
          <div className="row between wrap">
            <span className="badge good">{Icon.check} Synced · QuickBooks #{inv.qbo_id}</span>
            {paid > 0 && <button className="btn sm" disabled={busy} onClick={sync}>Sync new payments</button>}
          </div>
        ) : (
          <button className="btn" disabled={busy || inv.status === "draft"} onClick={sync}>Sync to QuickBooks</button>
        )}
      </div>

      <div className="row wrap">
        {inv.status !== "draft" && inv.status !== "void" && inv.status !== "paid" && <button className="btn grow" onClick={() => setEditing(true)}>Edit invoice</button>}
        {inv.job_id && <Link className="btn grow" to={`/jobs/${inv.job_id}`}>View job</Link>}
        {inv.status !== "void" && inv.status !== "paid" && (
          <button className="btn danger grow" disabled={busy} onClick={async () => { if (await ask({ title: "Void this invoice?", message: "A voided invoice can no longer be paid.", confirmLabel: "Void invoice", danger: true })) { void setStatus("void", "Invoice voided").then(() => nav("/invoices")); } }}>Void</button>
        )}
        {isManager(me.role) && (
          <button className="btn danger grow" disabled={busy} onClick={async () => {
            if (!(await ask({ title: `Delete invoice #${inv.number}?`, message: myPayments.length ? "This permanently removes the invoice and its recorded payments. It cannot be undone." : "This permanently removes the invoice. It cannot be undone.", confirmLabel: "Delete invoice", danger: true }))) return;
            setBusy(true);
            try { await store.deleteInvoice(inv.id); await refresh(); toast("Invoice deleted"); nav("/invoices"); }
            catch (e) { toast(errMsg(e, "Could not delete the invoice")); }
            finally { setBusy(false); }
          }}>Delete</button>
        )}
      </div>

      {sendOpen && (
        <SendSheet
          title="Send invoice"
          filename={`Invoice-${inv.number}.pdf`}
          makePdf={makePdf}
          portalLink={portalUrl(customer?.portal_token) || portalPreviewUrl()}
          to={customer?.email}
          phone={customer?.phone}
          subject={subject}
          body={body}
          onConfirm={inv.status === "draft" ? () => setStatus("sent", "Invoice sent") : undefined}
          confirmLabel="I sent it, mark as sent"
          onClose={() => setSendOpen(false)}
        />
      )}
      {editing && <InvoiceForm invoice={inv} onClose={() => setEditing(false)} />}
      {takeOpen && <TakePaymentSheet invoice={inv} customer={customer} balance={balance} onClose={() => setTakeOpen(false)} />}
      {cardOpen && <CardPaySheet invoice={inv} customer={customer} balance={balance} onClose={() => setCardOpen(false)} />}
      {manualOpen && <ManualPaySheet invoice={inv} balance={balance} onClose={() => setManualOpen(false)} />}
    </div>
  );
}
