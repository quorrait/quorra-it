import { useMemo, useState } from "react";
import { useData } from "../lib/app";
import { amountPaid, balanceDue, invoiceTotals, money, moneyShort } from "../lib/money";
import { addDays, startOfDay, startOfMonth } from "../lib/dates";
import { BarChart, Spinner } from "../components/ui";
import { downloadCsv } from "../lib/csv";

type Range = "7" | "30" | "90" | "ytd";
const RANGES: [Range, string][] = [["7", "7 days"], ["30", "30 days"], ["90", "90 days"], ["ytd", "This year"]];

export default function Reports() {
  const { loading, payments, invoices, jobs, team, customerById, estimates, leads } = useData();
  const [range, setRange] = useState<Range>("30");

  const r = useMemo(() => {
    const now = new Date();
    const from = range === "ytd" ? new Date(now.getFullYear(), 0, 1) : addDays(startOfDay(now), -Number(range) + 1);
    const inR = (iso: string) => new Date(iso) >= from && new Date(iso) <= now;
    const pays = payments.filter((p) => inR(p.paid_at));
    const collected = pays.reduce((s, p) => s + p.amount_cents, 0);
    const invs = invoices.filter((i) => i.status !== "void" && i.status !== "draft" && inR(i.issued_at));
    const billed = invs.reduce((s, i) => s + invoiceTotals(i).total, 0);
    const done = jobs.filter((j) => j.status === "completed" && inR(j.start_at));
    const byMethod: Record<string, number> = {};
    pays.forEach((p) => { byMethod[p.method] = (byMethod[p.method] ?? 0) + p.amount_cents; });
    // revenue by tech: collected payments on invoices tied to their jobs
    const byTech: Record<string, number> = {};
    for (const p of pays) {
      const inv = invoices.find((i) => i.id === p.invoice_id);
      const job = inv?.job_id ? jobs.find((j) => j.id === inv.job_id) : undefined;
      const k = job?.assigned_to || "Unassigned";
      byTech[k] = (byTech[k] ?? 0) + p.amount_cents;
    }
    const byCust: Record<string, number> = {};
    for (const p of pays) {
      const inv = invoices.find((i) => i.id === p.invoice_id);
      const n = customerById(inv?.customer_id ?? "")?.name ?? "Unknown";
      byCust[n] = (byCust[n] ?? 0) + p.amount_cents;
    }
    const aging = [0, 0, 0, 0];
    for (const i of invoices) {
      if (i.status === "void" || i.status === "draft") continue;
      const due = balanceDue(i, payments);
      if (due <= 0) continue;
      const age = Math.floor((now.getTime() - new Date(i.due_at).getTime()) / 86400_000);
      aging[age <= 30 ? 0 : age <= 60 ? 1 : age <= 90 ? 2 : 3] += due;
    }
    const months: { label: string; value: number; current: boolean }[] = [];
    for (let k = 5; k >= 0; k--) {
      const s = new Date(startOfMonth(now)); s.setMonth(s.getMonth() - k);
      const e = new Date(s); e.setMonth(e.getMonth() + 1);
      months.push({ label: s.toLocaleDateString("en-US", { month: "short" }), value: payments.filter((p) => new Date(p.paid_at) >= s && new Date(p.paid_at) < e).reduce((a, p) => a + p.amount_cents, 0), current: k === 0 });
    }
    const won = estimates.filter((e) => e.status === "approved").length;
    const lost = estimates.filter((e) => e.status === "declined").length;
    const lw = leads.filter((l) => l.stage === "won").length;
    const ll = leads.filter((l) => l.stage === "lost").length;
    return { pays, collected, billed, done, byMethod, byTech, byCust, aging, months, estRate: won + lost ? Math.round((won / (won + lost)) * 100) : null, leadRate: lw + ll ? Math.round((lw / (lw + ll)) * 100) : null, invs, from };
  }, [range, payments, invoices, jobs, customerById, estimates, leads]);

  if (loading) return <Spinner />;
  const top = (o: Record<string, number>, n = 6) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n);

  return (
    <div className="stack">
      <div className="page-head">
        <h1 className="page-title">Reports</h1>
        <button className="btn" onClick={() => downloadCsv("payments.csv", [["Date", "Invoice #", "Customer", "Method", "Amount"], ...r.pays.map((p) => { const i = invoices.find((x) => x.id === p.invoice_id); return [new Date(p.paid_at).toLocaleDateString(), i?.number ?? "", customerById(i?.customer_id ?? "")?.name ?? "", p.method, (p.amount_cents / 100).toFixed(2)]; })])}>Export payments CSV</button>
      </div>
      <div className="chips">{RANGES.map(([k, l]) => <button key={k} className={`chip${range === k ? " on" : ""}`} onClick={() => setRange(k)}>{l}</button>)}</div>
      <div className="kpi-grid">
        <div className="kpi"><div className="lbl">Collected</div><div className="val num">{moneyShort(r.collected)}</div><div className="sub">{r.pays.length} payments</div></div>
        <div className="kpi"><div className="lbl">Invoiced</div><div className="val num">{moneyShort(r.billed)}</div><div className="sub">{r.invs.length} invoices</div></div>
        <div className="kpi"><div className="lbl">Jobs completed</div><div className="val">{r.done.length}</div></div>
        <div className="kpi"><div className="lbl">Avg ticket</div><div className="val num">{r.invs.length ? moneyShort(Math.round(r.billed / r.invs.length)) : "-"}</div></div>
      </div>
      <div className="card"><div className="card-title">Money in, last 6 months</div><BarChart data={r.months} /></div>
      <div className="grid2">
        <div className="card"><div className="card-title">Receivables aging</div>
          {["Current (0-30)", "31-60 days", "61-90 days", "90+ days"].map((l, i) => <div key={l} className="row between" style={{ padding: "6px 0" }}><span>{l}</span><b className="num">{money(r.aging[i])}</b></div>)}
        </div>
        <div className="card"><div className="card-title">Pipeline</div>
          <div className="row between" style={{ padding: "6px 0" }}><span>Estimate win rate</span><b>{r.estRate === null ? "-" : `${r.estRate}%`}</b></div>
          <div className="row between" style={{ padding: "6px 0" }}><span>Lead conversion</span><b>{r.leadRate === null ? "-" : `${r.leadRate}%`}</b></div>
          {top(r.byMethod).map(([m, v]) => <div key={m} className="row between" style={{ padding: "6px 0" }}><span style={{ textTransform: "capitalize" }}>{m} payments</span><b className="num">{money(v)}</b></div>)}
        </div>
      </div>
      <div className="grid2">
        <div className="card flush scroll-x"><div className="card-title" style={{ padding: "14px 16px 0" }}>Revenue by technician</div>
          <table className="tbl"><thead><tr><th>Name</th><th className="r">Collected</th><th className="r">Commission</th></tr></thead><tbody>
            {top(r.byTech).map(([n, v]) => { const m = team.find((t) => t.name === n); return <tr key={n}><td>{n}</td><td className="r num">{money(v)}</td><td className="r num">{m ? money(Math.round((v * m.commission_pct) / 100)) : "-"}</td></tr>; })}
            {!Object.keys(r.byTech).length && <tr><td colSpan={3} className="muted">No data</td></tr>}
          </tbody></table></div>
        <div className="card flush scroll-x"><div className="card-title" style={{ padding: "14px 16px 0" }}>Top customers</div>
          <table className="tbl"><thead><tr><th>Customer</th><th className="r">Paid</th></tr></thead><tbody>
            {top(r.byCust).map(([n, v]) => <tr key={n}><td>{n}</td><td className="r num">{money(v)}</td></tr>)}
            {!Object.keys(r.byCust).length && <tr><td colSpan={2} className="muted">No data</td></tr>}
          </tbody></table></div>
      </div>
    </div>
  );
}
