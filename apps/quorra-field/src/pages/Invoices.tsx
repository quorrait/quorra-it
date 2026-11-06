import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useData } from "../lib/app";
import { amountPaid, balanceDue, invoiceTotals, isOverdue, money } from "../lib/money";
import { fmtDate } from "../lib/dates";
import { Icon, InvoiceBadge, Spinner } from "../components/ui";
import InvoiceForm from "../components/InvoiceForm";

type Filter = "all" | "unpaid" | "overdue" | "paid" | "draft";

export default function Invoices() {
  const { loading, invoices, payments, customerById } = useData();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [filter, setFilter] = useState<Filter>((params.get("f") as Filter) || "all");
  const [adding, setAdding] = useState(false);

  const rows = useMemo(() => {
    return invoices
      .filter((i) => {
        if (i.status === "void") return false;
        if (filter === "unpaid") return i.status === "sent";
        if (filter === "overdue") return isOverdue(i, payments);
        if (filter === "paid") return i.status === "paid";
        if (filter === "draft") return i.status === "draft";
        return true;
      })
      .sort((a, b) => b.number - a.number);
  }, [invoices, payments, filter]);

  if (loading) return <Spinner />;

  const totalDue = rows.filter((i) => i.status === "sent").reduce((s, i) => s + balanceDue(i, payments), 0);

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1 className="page-title">Invoices</h1>
          {filter !== "paid" && filter !== "draft" && <p className="page-sub">{money(totalDue)} waiting to be paid</p>}
        </div>
        <button className="btn primary" onClick={() => setAdding(true)}>{Icon.plus} New invoice</button>
      </div>

      <div className="chips">
        {([["all", "All"], ["unpaid", "Unpaid"], ["overdue", "Overdue"], ["paid", "Paid"], ["draft", "Drafts"]] as [Filter, string][]).map(([k, label]) => (
          <button key={k} className={`chip${filter === k ? " on" : ""}`} onClick={() => setFilter(k)}>{label}</button>
        ))}
      </div>

      <div className="card flush">
        {rows.length === 0 && <div className="empty">No invoices here</div>}
        <div className="list">
          {rows.slice(0, 100).map((i) => {
            const total = invoiceTotals(i).total;
            const paid = amountPaid(i.id, payments);
            return (
              <div key={i.id} className="list-item" onClick={() => nav(`/invoices/${i.id}`)}>
                <div className="grow">
                  <div className="title">#{i.number} · {customerById(i.customer_id)?.name}</div>
                  <div className="small muted">Due {fmtDate(i.due_at)}</div>
                </div>
                <div className="right">
                  <div className="bold num">{money(total)}</div>
                  <div style={{ marginTop: 2 }}>
                    <InvoiceBadge status={i.status} overdue={isOverdue(i, payments)} partial={paid > 0 && paid < total} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {adding && <InvoiceForm onClose={() => setAdding(false)} onSaved={(i) => nav(`/invoices/${i.id}`)} />}
    </div>
  );
}
