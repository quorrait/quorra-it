import { useMemo, useState } from "react";
import { useData } from "../lib/app";
import { amountPaid, balanceDue, invoiceTotals, money, moneyShort } from "../lib/money";
import { addDays, startOfDay, startOfMonth, startOfWeek, toInputDate } from "../lib/dates";
import { BarChart, Spinner } from "../components/ui";
import { downloadCsv } from "../lib/csv";

type Range = "day" | "week" | "month" | "year" | "custom";
const RANGES: [Range, string][] = [["day", "Daily"], ["week", "Weekly"], ["month", "Monthly"], ["year", "Yearly"], ["custom", "Custom dates"]];

/** The window [from, to) for a period, shifted back or forward by `offset` periods. */
function windowFor(range: Range, offset: number, cFrom: string, cTo: string): { from: Date; to: Date; label: string } {
  const now = new Date();
  const f = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  if (range === "day") { const from = addDays(startOfDay(now), offset); return { from, to: addDays(from, 1), label: from.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", year: "numeric" }) }; }
  if (range === "week") { const from = addDays(startOfWeek(now), offset * 7); const to = addDays(from, 7); return { from, to, label: `${f(from)} to ${f(addDays(to, -1))}` }; }
  if (range === "month") { const from = startOfMonth(now); from.setMonth(from.getMonth() + offset); const to = new Date(from); to.setMonth(to.getMonth() + 1); return { from, to, label: from.toLocaleDateString("en-US", { month: "long", year: "numeric" }) }; }
  if (range === "year") { const from = new Date(now.getFullYear() + offset, 0, 1); return { from, to: new Date(from.getFullYear() + 1, 0, 1), label: String(from.getFullYear()) }; }
  const from = startOfDay(new Date(`${cFrom}T00:00:00`)); const to = addDays(startOfDay(new Date(`${cTo}T00:00:00`)), 1);
  return { from, to: to > from ? to : addDays(from, 1), label: `${f(from)} to ${f(addDays(to > from ? to : addDays(from, 1), -1))}` };
}

export default function Reports() {
  const { loading, payments, invoices, jobs, team, customerById, estimates, leads } = useData();
  const [range, setRange] = useState<Range>("month");
  const [offset, setOffset] = useState(0);
  const [cFrom, setCFrom] = useState(toInputDate(addDays(new Date(), -29)));
  const [cTo, setCTo] = useState(toInputDate(new Date()));

  const r = useMemo(() => {
    const now = new Date();
    const { from, to, label } = windowFor(range, offset, cFrom, cTo);
    const inR = (iso: string) => new Date(iso) >= from && new Date(iso) < to;
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
    // Chart buckets follow the window: hours for a day, days up to about two months, months beyond that.
    const spanDays = (to.getTime() - from.getTime()) / 86400_000;
    const months: { label: string; value: number; current: boolean }[] = [];
    const sumIn = (s0: Date, e0: Date) => payments.filter((p) => new Date(p.paid_at) >= s0 && new Date(p.paid_at) < e0).reduce((a, p) => a + p.amount_cents, 0);
    const cur = (s0: Date, e0: Date) => now >= s0 && now < e0;
    let chartTitle = "Money in by day";
    if (spanDays <= 1) {
      chartTitle = "Money in by hour";
      for (let h = 6; h <= 20; h++) { const s0 = new Date(from); s0.setHours(h); const e0 = new Date(s0); e0.setHours(h + 1); months.push({ label: `${((h + 11) % 12) + 1}${h < 12 ? "a" : "p"}`, value: sumIn(s0, e0), current: cur(s0, e0) }); }
    } else if (spanDays <= 62) {
      for (let k = 0; k < spanDays; k++) { const s0 = addDays(from, k); const e0 = addDays(s0, 1); months.push({ label: spanDays <= 8 ? s0.toLocaleDateString("en-US", { weekday: "short" }) : String(s0.getDate()), value: sumIn(s0, e0), current: cur(s0, e0) }); }
    } else {
      chartTitle = "Money in by month";
      for (let s0 = startOfMonth(from); s0 < to; ) { const e0 = new Date(s0); e0.setMonth(e0.getMonth() + 1); months.push({ label: s0.toLocaleDateString("en-US", { month: "short" }), value: sumIn(s0, e0), current: cur(s0, e0) }); s0 = e0; }
    }
    const won = estimates.filter((e) => e.status === "approved").length;
    const lost = estimates.filter((e) => e.status === "declined").length;
    const lw = leads.filter((l) => l.stage === "work_order" || l.stage === "completed").length;
    const ll = leads.filter((l) => l.stage === "declined").length;
    return { pays, collected, billed, done, byMethod, byTech, byCust, aging, months, estRate: won + lost ? Math.round((won / (won + lost)) * 100) : null, leadRate: lw + ll ? Math.round((lw / (lw + ll)) * 100) : null, invs, from, to, label, chartTitle };
  }, [range, offset, cFrom, cTo, payments, invoices, jobs, customerById, estimates, leads]);

  if (loading) return <Spinner />;
  const top = (o: Record<string, number>, n = 6) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n);

  return (
    <div className="stack">
      <div className="page-head">
        <h1 className="page-title">Reports</h1>
        <button className="btn" onClick={() => downloadCsv("payments.csv", [["Date", "Invoice #", "Customer", "Method", "Amount"], ...r.pays.map((p) => { const i = invoices.find((x) => x.id === p.invoice_id); return [new Date(p.paid_at).toLocaleDateString(), i?.number ?? "", customerById(i?.customer_id ?? "")?.name ?? "", p.method, (p.amount_cents / 100).toFixed(2)]; })])}>Export payments CSV</button>
      </div>
      <div className="chips">{RANGES.map(([k, l]) => <button key={k} className={`chip${range === k ? " on" : ""}`} onClick={() => { setRange(k); setOffset(0); }}>{l}</button>)}</div>
      {range === "custom" ? (
        <div className="grid2 stack-sm">
          <label className="field"><span>From</span><input className="input" type="date" value={cFrom} max={cTo} onChange={(e) => e.target.value && setCFrom(e.target.value)} /></label>
          <label className="field"><span>To</span><input className="input" type="date" value={cTo} min={cFrom} onChange={(e) => e.target.value && setCTo(e.target.value)} /></label>
        </div>
      ) : (
        <div className="row between">
          <button className="btn sm" onClick={() => setOffset(offset - 1)} aria-label="Previous period">‹ Previous</button>
          <div className="bold" style={{ textAlign: "center" }}>{r.label}</div>
          <button className="btn sm" onClick={() => setOffset(Math.min(0, offset + 1))} disabled={offset >= 0} aria-label="Next period">Next ›</button>
        </div>
      )}
      <div className="kpi-grid">
        <div className="kpi"><div className="lbl">Collected</div><div className="val num">{moneyShort(r.collected)}</div><div className="sub">{r.pays.length} payments</div></div>
        <div className="kpi"><div className="lbl">Invoiced</div><div className="val num">{moneyShort(r.billed)}</div><div className="sub">{r.invs.length} invoices</div></div>
        <div className="kpi"><div className="lbl">Jobs completed</div><div className="val">{r.done.length}</div></div>
        <div className="kpi"><div className="lbl">Avg ticket</div><div className="val num">{r.invs.length ? moneyShort(Math.round(r.billed / r.invs.length)) : "-"}</div></div>
      </div>
      <div className="card"><div className="card-title">{r.chartTitle}</div><BarChart data={r.months} /></div>
      <div className="grid2">
        <div className="card"><div className="card-title">Receivables aging</div>
          {["Current (0-30)", "31-60 days", "61-90 days", "90+ days"].map((l, i) => <div key={l} className="row between" style={{ padding: "6px 0" }}><span>{l}</span><b className="num">{money(r.aging[i])}</b></div>)}
        </div>
        <div className="card"><div className="card-title">Win rates and payment types</div>
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
