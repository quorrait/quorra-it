import SearchBox, { searchHit } from "../components/SearchBox";
import WorkTabs from "../components/WorkTabs";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useData } from "../lib/app";
import { invoiceTotals, money, moneyShort } from "../lib/money";
import { fmtDate } from "../lib/dates";
import { Icon, Spinner } from "../components/ui";
import EstimateForm from "../components/EstimateForm";
import type { EstimateStatus } from "../lib/types";

export const EstimateBadge = ({ status }: { status: EstimateStatus }) => {
  const map: Record<EstimateStatus, [string, string]> = {
    draft: ["gray", "Draft"],
    sent: ["blue", "Sent"],
    approved: ["good", "Approved"],
    declined: ["bad", "Declined"],
  };
  const [c, t] = map[status];
  return <span className={`badge ${c}`}>{t}</span>;
};

type Filter = "all" | EstimateStatus;

export default function Estimates() {
  const { loading, estimates, customerById } = useData();
  const nav = useNavigate();
  const [filter, setFilter] = useState<Filter>("all");
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState("");

  const rows = useMemo(
    () => estimates.filter((e) => (filter === "all" || e.status === filter) && searchHit(q, [e.number, e.title, e.status, customerById(e.customer_id)?.name, customerById(e.customer_id)?.address, customerById(e.customer_id)?.phone, ...e.items.map((i) => i.description)], invoiceTotals(e).total)).sort((a, b) => b.number - a.number),
    [estimates, filter, q, customerById],
  );

  if (loading) return <Spinner />;

  const total = (e: (typeof estimates)[number]) => invoiceTotals(e).total;
  const openValue = estimates.filter((e) => e.status === "sent").reduce((s, e) => s + total(e), 0);
  const won = estimates.filter((e) => e.status === "approved");
  const lost = estimates.filter((e) => e.status === "declined");
  const winRate = won.length + lost.length ? Math.round((won.length / (won.length + lost.length)) * 100) : null;

  return (
    <div className="stack">
      <WorkTabs />
      <div className="page-head">
        <h1 className="page-title">Estimates</h1>
        <button className="btn primary" onClick={() => setAdding(true)}>{Icon.plus} New estimate</button>
      </div>

      <div className="kpi-grid">
        <div className="kpi"><div className="lbl">Waiting on customer</div><div className="val num">{moneyShort(openValue)}</div><div className="sub">{estimates.filter((e) => e.status === "sent").length} sent</div></div>
        <div className="kpi"><div className="lbl">Approved</div><div className="val num">{moneyShort(won.reduce((s, e) => s + total(e), 0))}</div><div className="sub">{won.length} estimates</div></div>
        <div className="kpi"><div className="lbl">Acceptance rate</div><div className="val">{winRate === null ? "-" : `${winRate}%`}</div><div className="sub">approved vs declined</div></div>
        <div className="kpi"><div className="lbl">Drafts</div><div className="val">{estimates.filter((e) => e.status === "draft").length}</div><div className="sub">not sent yet</div></div>
      </div>

      <SearchBox value={q} onChange={setQ} placeholder="Search by customer, address, job type, number or amount" />
      <div className="chips">
        {([["all", "All"], ["draft", "Draft"], ["sent", "Sent"], ["approved", "Approved"], ["declined", "Declined"]] as [Filter, string][]).map(([k, label]) => (
          <button key={k} className={`chip${filter === k ? " on" : ""}`} onClick={() => setFilter(k)}>{label}</button>
        ))}
      </div>

      <div className="card flush">
        {rows.length === 0 && <div className="empty">No estimates match this filter</div>}
        <div className="list">
          {rows.map((e) => (
            <div key={e.id} className="list-item" onClick={() => nav(`/estimates/${e.id}`)}>
              <div className="grow">
                <div className="title">#{e.number} · {e.title}</div>
                <div className="small muted">{customerById(e.customer_id)?.name} · {fmtDate(e.issued_at)}</div>
              </div>
              <div className="right">
                <div className="bold num">{money(total(e))}</div>
                <div style={{ marginTop: 2 }}><EstimateBadge status={e.status} /></div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {adding && <EstimateForm onClose={() => setAdding(false)} onSaved={(e) => nav(`/estimates/${e.id}`)} />}
    </div>
  );
}
