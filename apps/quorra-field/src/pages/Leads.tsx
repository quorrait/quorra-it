import { FlagBanner } from "../components/FlagBanner";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useData } from "../lib/app";
import { moneyShort } from "../lib/money";
import { fmtDate, fmtTime } from "../lib/dates";
import { Field, Icon, JobBadge, Sheet, Spinner, useToast, useConfirm } from "../components/ui";
import { centsToStr, strToCents } from "../components/LineItems";
import EstimateForm from "../components/EstimateForm";
import JobForm from "../components/JobForm";
import type { Lead, LeadStage } from "../lib/types";

export const STAGE_LABEL: Record<LeadStage, string> = {
  new: "New", contacted: "Contacted", send_quote: "Send quote", quote_sent: "Quote sent", work_order: "Work order", declined: "Declined", completed: "Completed",
};
const PIPELINE: LeadStage[] = ["new", "contacted", "send_quote", "quote_sent"];
const SOURCES = ["Website form", "Google", "Referral", "Yelp", "Facebook", "Nextdoor", "Repeat customer", "Other"];
const REASONS = ["Price too high", "Went with someone else", "Not ready yet", "No response", "Out of service area", "Other"];

type Tab = "pipeline" | "work" | "declined" | "completed";
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

function LeadForm({ lead, onClose, onBuildQuote }: { lead?: Lead; onClose(): void; onBuildQuote?(l: Lead): void }) {
  const { store, refresh } = useData();
  const toast = useToast();
  const ask = useConfirm();
  const [f, setF] = useState({
    name: lead?.name ?? "", phone: lead?.phone ?? "", email: lead?.email ?? "", address: lead?.address ?? "",
    source: lead?.source ?? "Google", service: lead?.service ?? "", value: centsToStr(lead?.value_cents ?? 0), notes: lead?.notes ?? "",
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  async function save() {
    if (!f.name.trim()) { toast("Add a name"); return null; }
    const saved = await store.saveRow("leads", {
      id: lead?.id, name: f.name.trim(), phone: f.phone, email: f.email, address: f.address, source: f.source, service: f.service,
      value_cents: strToCents(f.value), stage: lead?.stage ?? "new", notes: f.notes, customer_id: lead?.customer_id ?? null,
      estimate_id: lead?.estimate_id ?? null, job_id: lead?.job_id ?? null, created_at: lead?.created_at ?? new Date().toISOString(),
    });
    await refresh();
    return saved;
  }

  const { customers } = useData();
  const norm = (s: string) => s.replace(/\D/g, "").slice(-10);
  const hit = customers.find((c) => c.flag && ((f.phone && norm(f.phone).length >= 7 && norm(c.phone) === norm(f.phone)) || (f.email && c.email.toLowerCase() === f.email.toLowerCase())));
  return (
    <Sheet title={lead ? lead.name : "New lead"} onClose={onClose}>
      <div className="stack">
        <FlagBanner c={hit} />
        <Field label="Name"><input className="input" value={f.name} onChange={set("name")} /></Field>
        <div className="grid2 stack-sm">
          <Field label="Phone"><input className="input" type="tel" value={f.phone} onChange={set("phone")} /></Field>
          <Field label="Email"><input className="input" type="email" value={f.email} onChange={set("email")} /></Field>
        </div>
        <Field label="Address"><input className="input" value={f.address} onChange={set("address")} /></Field>
        <Field label="Service requested"><input className="input" value={f.service} onChange={set("service")} placeholder="e.g. AC replacement, panel upgrade" /></Field>
        <div className="grid2 stack-sm">
          <Field label="Est. value ($)"><input className="input" inputMode="decimal" value={f.value} onChange={set("value")} /></Field>
          <Field label="Source"><select className="select" value={f.source} onChange={set("source")}>{SOURCES.map((s) => <option key={s}>{s}</option>)}</select></Field>
        </div>
        <Field label="Notes"><textarea className="textarea" value={f.notes} onChange={set("notes")} /></Field>
        <button className="btn primary block" onClick={async () => { if (await save()) { toast("Lead saved"); onClose(); } }}>Save lead</button>
        {lead && !lead.estimate_id && lead.stage !== "work_order" && onBuildQuote && (
          <button className="btn block" onClick={async () => { const s = await save(); if (s) { onClose(); onBuildQuote(s); } }}>Build quote</button>
        )}
        {lead && <button className="btn danger block" onClick={async () => { if (await ask({ title: "Delete this lead?", message: "This cannot be undone.", confirmLabel: "Delete", danger: true })) { await store.deleteRow("leads", lead.id); await refresh(); onClose(); } }}>Delete</button>}
      </div>
    </Sheet>
  );
}

export default function Leads() {
  const { loading, leads, jobs, estimates, customers, store, refresh } = useData();
  const toast = useToast();
  const askDel = useConfirm();
  const nav = useNavigate();
  const [tab, setTab] = useState<Tab>("pipeline");
  const [edit, setEdit] = useState<Lead | "new" | null>(null);
  const [over, setOver] = useState<LeadStage | null>(null);
  const [quote, setQuote] = useState<{ lead: Lead; customerId: string } | null>(null);
  const [schedule, setSchedule] = useState<{ lead: Lead; customerId: string } | null>(null);
  const [decline, setDecline] = useState<Lead | null>(null);

  if (loading) return <Spinner />;

  const patch = async (l: Lead, p: Partial<Lead>) => { await store.saveRow("leads", { ...l, ...p }); await refresh(); };

  /** A lead becomes a customer the first time we build a quote or a job for them. */
  async function customerFor(l: Lead): Promise<string> {
    if (l.customer_id && customers.some((c) => c.id === l.customer_id)) return l.customer_id;
    let c = customers.find((x) => norm(x.name) === norm(l.name));
    if (!c) c = await store.saveCustomer({ name: l.name, phone: l.phone, email: l.email, address: l.address, notes: "" });
    await store.saveRow("leads", { ...l, customer_id: c.id });
    await refresh(); // so the new customer is available in the forms that open next
    return c.id;
  }

  async function move(l: Lead, stage: LeadStage) {
    if (l.stage === stage) return;
    if (stage === "send_quote") {
      if (l.estimate_id && estimates.some((e) => e.id === l.estimate_id)) return patch(l, { stage });
      return setQuote({ lead: l, customerId: await customerFor(l) });
    }
    if (stage === "quote_sent") {
      const est = estimates.find((e) => e.id === l.estimate_id);
      if (est && est.status === "draft") await store.saveRow("estimates", { ...est, status: "sent" });
      return patch(l, { stage });
    }
    if (stage === "work_order") return setSchedule({ lead: l, customerId: await customerFor(l) });
    if (stage === "declined") return setDecline(l);
    return patch(l, { stage });
  }

  const pipeline = leads.filter((l) => PIPELINE.includes(l.stage));
  const jobDone = (l: Lead) => Boolean(l.job_id && jobs.find((j) => j.id === l.job_id)?.status === "completed");
  const work = leads.filter((l) => l.stage === "work_order" && !jobDone(l));
  const completed = leads.filter((l) => l.stage === "completed" || (l.stage === "work_order" && jobDone(l)));
  const del = async (l: Lead) => { if (await askDel({ title: "Delete this work order?", message: "It is removed from this list. The job on your calendar is not deleted.", confirmLabel: "Delete", danger: true })) { await store.deleteRow("leads", l.id); await refresh(); toast("Deleted"); } };
  const declined = leads.filter((l) => l.stage === "declined");
  const sum = (a: Lead[]) => a.reduce((s, l) => s + l.value_cents, 0);
  const won = work.length + completed.length;
  const rate = won + declined.length ? Math.round((won / (won + declined.length)) * 100) : null;

  const actions = (l: Lead) => {
    const est = estimates.find((e) => e.id === l.estimate_id);
    const btn = (label: string, fn: () => void, primary = false) => (
      <button className={`btn sm${primary ? " primary" : ""}`} onClick={(e) => { e.stopPropagation(); fn(); }}>{label}</button>
    );
    switch (l.stage) {
      case "new": return <>{btn("Mark contacted", () => void move(l, "contacted"), true)}{btn("Decline", () => void move(l, "declined"))}</>;
      case "contacted": return <>{btn("Send quote →", () => void move(l, "send_quote"), true)}{btn("Decline", () => void move(l, "declined"))}</>;
      case "send_quote": return <>{est ? btn("Open quote", () => nav(`/estimates/${est.id}`), true) : btn("Build quote", () => void move({ ...l, stage: "contacted" }, "send_quote"), true)}{btn("Decline", () => void move(l, "declined"))}</>;
      case "quote_sent": return <>{est?.status === "approved" && !est.job_id && <span className="badge good">Accepted, waiting for them to pick a time</span>}{btn("Accepted → schedule", () => void move(l, "work_order"), true)}{btn("Declined", () => void move(l, "declined"))}{est && btn("View quote", () => nav(`/estimates/${est.id}`))}</>;
      default: return null;
    }
  };

  return (
    <div className="stack">
      <div className="page-head">
        <div><h1 className="page-title">Leads</h1><p className="page-sub">New requests, quotes out, and accepted work.</p></div>
        <button className="btn primary" onClick={() => setEdit("new")}>{Icon.plus} New lead</button>
      </div>

      <div className="kpi-grid">
        <div className="kpi"><div className="lbl">Open pipeline</div><div className="val num">{moneyShort(sum(pipeline))}</div><div className="sub">{pipeline.length} leads</div></div>
        <div className="kpi"><div className="lbl">New to follow up</div><div className="val">{leads.filter((l) => l.stage === "new").length}</div><div className="sub">not contacted yet</div></div>
        <div className="kpi"><div className="lbl">Work orders</div><div className="val num">{moneyShort(sum(work))}</div><div className="sub">{work.length} accepted</div></div>
        <div className="kpi"><div className="lbl">Close rate</div><div className="val">{rate === null ? "-" : `${rate}%`}</div><div className="sub">accepted vs declined</div></div>
      </div>

      <div className="chips">
        <button className={`chip${tab === "pipeline" ? " on" : ""}`} onClick={() => setTab("pipeline")}>Open leads ({pipeline.length})</button>
        <button className={`chip${tab === "work" ? " on" : ""}`} onClick={() => setTab("work")}>Work orders ({work.length})</button>
        <button className={`chip${tab === "completed" ? " on" : ""}`} onClick={() => setTab("completed")}>Completed ({completed.length})</button>
        <button className={`chip${tab === "declined" ? " on" : ""}`} onClick={() => setTab("declined")}>Declined ({declined.length})</button>
      </div>

      {tab === "pipeline" && (
        <div className="pipe pipe4">
          {PIPELINE.map((stage) => {
            const col = pipeline.filter((l) => l.stage === stage);
            return (
              <div key={stage} className={`pipe-col${over === stage ? " over" : ""}`}
                onDragOver={(e) => { e.preventDefault(); setOver(stage); }} onDragLeave={() => setOver(null)}
                onDrop={(e) => { e.preventDefault(); setOver(null); const l = leads.find((x) => x.id === e.dataTransfer.getData("text/plain")); if (l) void move(l, stage); }}>
                <div className="pipe-head"><b>{STAGE_LABEL[stage]}</b><span className="small muted">{col.length} · {moneyShort(sum(col))}</span></div>
                {col.map((l) => (
                  <div key={l.id} className="lead" draggable onDragStart={(e) => e.dataTransfer.setData("text/plain", l.id)} onClick={() => setEdit(l)}>
                    <div className="row between"><div className="bold">{l.name}</div>{l.source === "Website form" && <span className="badge blue">Web</span>}</div>
                    <div className="small muted">{l.service || "No details"}</div>
                    <div className="row between" style={{ marginTop: 6 }}><span className="small muted">{fmtDate(l.created_at)}</span><span className="bold num">{l.value_cents ? moneyShort(l.value_cents) : ""}</span></div>
                    <div className="row wrap" style={{ marginTop: 8 }}>{actions(l)}</div>
                  </div>
                ))}
                {col.length === 0 && <div className="small muted" style={{ textAlign: "center", padding: 16 }}>No leads</div>}
              </div>
            );
          })}
        </div>
      )}

      {tab === "work" && (
        <div className="card flush">
          {work.length === 0 && <div className="empty">Accepted quotes appear here once they are scheduled.</div>}
          <div className="list">
            {work.map((l) => {
              const job = jobs.find((j) => j.id === l.job_id);
              return (
                <div key={l.id} className="list-item" onClick={async () => (job ? nav(`/jobs/${job.id}`) : setSchedule({ lead: l, customerId: await customerFor(l) }))}>
                  <div className="grow">
                    <div className="title">{l.name}</div>
                    <div className="small muted">{l.service}{job ? ` · ${fmtDate(job.start_at)} ${fmtTime(job.start_at)}` : " · not scheduled yet"}</div>
                  </div>
                  <div className="right">{l.value_cents > 0 && <div className="bold num">{moneyShort(l.value_cents)}</div>}{job ? <JobBadge status={job.status} /> : <span className="badge gray">Tap to schedule</span>}<button className="btn sm danger" style={{ marginLeft: 14 }} onClick={(e) => { e.stopPropagation(); void del(l); }}>Delete</button></div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab === "completed" && (
        <div className="card flush">
          {completed.length === 0 && <div className="empty">Paid jobs move here from Work orders.</div>}
          <div className="list">
            {completed.map((l) => {
              const job = jobs.find((j) => j.id === l.job_id);
              return (
                <div key={l.id} className="list-item" onClick={() => (job ? nav(`/jobs/${job.id}`) : setEdit(l))}>
                  <div className="grow"><div className="title">{l.name}</div><div className="small muted">{l.service}{job ? ` · ${fmtDate(job.start_at)}` : ""}</div></div>
                  <div className="right">{l.value_cents > 0 && <div className="bold num">{moneyShort(l.value_cents)}</div>}<span className="badge good">Paid</span><button className="btn sm danger" style={{ marginLeft: 14 }} onClick={(e) => { e.stopPropagation(); void del(l); }}>Delete</button></div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab === "declined" && (
        <div className="card flush">
          {declined.length === 0 && <div className="empty">No declined leads.</div>}
          <div className="list">
            {declined.map((l) => (
              <div key={l.id} className="list-item" onClick={() => setEdit(l)}>
                <div className="grow"><div className="title">{l.name}</div><div className="small muted">{l.service || "No details"}{l.notes ? ` · ${l.notes.split("\n").pop()}` : ""}</div></div>
                <div className="right"><div className="bold num">{l.value_cents ? moneyShort(l.value_cents) : ""}</div>
                  <button className="btn sm" onClick={(e) => { e.stopPropagation(); void patch(l, { stage: "contacted" }); toast("Moved back to Contacted"); }}>Reopen</button></div>
              </div>
            ))}
          </div>
        </div>
      )}

      {edit && <LeadForm lead={edit === "new" ? undefined : edit} onClose={() => setEdit(null)} onBuildQuote={(l) => void move({ ...l, stage: "contacted" }, "send_quote")} />}

      {quote && (
        <EstimateForm customerId={quote.customerId} title={quote.lead.service} onClose={() => setQuote(null)}
          onSaved={async (est) => { await patch(quote.lead, { estimate_id: est.id, stage: "send_quote", customer_id: quote.customerId }); toast("Quote built. Send it, then confirm it was sent."); nav(`/estimates/${est.id}`); }} />
      )}

      {schedule && (
        <JobForm fromLead defaultCustomer={schedule.customerId} defaultTitle={schedule.lead.service || schedule.lead.name} onClose={() => setSchedule(null)}
          onSaved={async (job) => {
            const est = estimates.find((e) => e.id === schedule.lead.estimate_id);
            if (est) await store.saveRow("estimates", { ...est, status: "approved", job_id: job.id });
            await patch(schedule.lead, { stage: "work_order", job_id: job.id });
            toast("On the calendar and in Work orders");
            setTab("work");
          }} />
      )}

      {decline && (
        <Sheet title={`Why did ${decline.name} decline?`} onClose={() => setDecline(null)}>
          <div className="stack">
            {REASONS.map((r) => (
              <button key={r} className="btn block" onClick={async () => {
                const est = estimates.find((e) => e.id === decline.estimate_id);
                if (est && est.status !== "declined") await store.saveRow("estimates", { ...est, status: "declined" });
                await patch(decline, { stage: "declined", notes: `${decline.notes ? decline.notes + "\n" : ""}Declined: ${r}` });
                setDecline(null); setTab("declined");
              }}>{r}</button>
            ))}
          </div>
        </Sheet>
      )}
      <Link to="/settings" className="small muted no-print" style={{ alignSelf: "center" }}>Add a lead form to your website under Settings</Link>
    </div>
  );
}
