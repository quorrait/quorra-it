import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Bar } from "../lib/stats";
import { moneyShort } from "../lib/money";
import type { InvoiceStatus, JobStatus } from "../lib/types";

/* ---------- Icons (inline, no deps) ---------- */
const P = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;
export const Icon = {
  home: <svg viewBox="0 0 24 24" {...P}><path d="M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10" /></svg>,
  cal: <svg viewBox="0 0 24 24" {...P}><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>,
  jobs: <svg viewBox="0 0 24 24" {...P}><rect x="3" y="8" width="18" height="12" rx="3" /><path d="M9 8V6a2 2 0 012-2h2a2 2 0 012 2v2M3 14h18" /></svg>,
  invoice: <svg viewBox="0 0 24 24" {...P}><path d="M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6" /></svg>,
  more: <svg viewBox="0 0 24 24" {...P}><circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" /></svg>,
  users: <svg viewBox="0 0 24 24" {...P}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5M16 4.8a3.5 3.5 0 010 6.4M18 14.8c2 .6 3.3 2.3 3.6 5.2" /></svg>,
  gear: <svg viewBox="0 0 24 24" {...P}><circle cx="12" cy="12" r="3" /><path d="M19 12a7 7 0 00-.1-1.2l2-1.5-2-3.5-2.3 1a7 7 0 00-2-1.2L14.2 3h-4l-.4 2.6a7 7 0 00-2 1.2l-2.3-1-2 3.5 2 1.5A7 7 0 005 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.5 2.3-1c.6.5 1.3.9 2 1.2l.4 2.6h4l.4-2.6c.7-.3 1.4-.7 2-1.2l2.3 1 2-3.5-2-1.5c.1-.4.1-.8.1-1.2z" /></svg>,
  plus: <svg viewBox="0 0 24 24" {...P}><path d="M12 5v14M5 12h14" /></svg>,
  card: <svg viewBox="0 0 24 24" {...P}><rect x="2.5" y="5" width="19" height="14" rx="3" /><path d="M2.5 10h19M6 15h4" /></svg>,
  phone: <svg viewBox="0 0 24 24" {...P}><path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2z" /></svg>,
  pin: <svg viewBox="0 0 24 24" {...P}><path d="M12 21s7-6.2 7-11.5a7 7 0 10-14 0C5 14.800 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></svg>,
  check: <svg viewBox="0 0 24 24" {...P}><path d="M5 12.5l4.5 4.5L19 7.500" /></svg>,
  send: <svg viewBox="0 0 24 24" {...P}><path d="M21 3L10 14M21 3l-7 18-4-7-7-4z" /></svg>,
};

/* ---------- Toast ---------- */
const ToastCtx = createContext<(msg: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null);
  const show = useCallback((m: string) => setMsg(m), []);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 2600);
    return () => clearTimeout(t);
  }, [msg]);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {msg && <div className="toast" role="status">{msg}</div>}
    </ToastCtx.Provider>
  );
}

/* ---------- Sheet (modal) ---------- */
export function Sheet({ title, onClose, children }: { title: string; onClose(): void; children: ReactNode }) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="sheet-head">
          <h2>{title}</h2>
          <button className="x" onClick={onClose} aria-label="Close">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

/* ---------- Badges ---------- */
export function JobBadge({ status }: { status: JobStatus }) {
  const map: Record<JobStatus, [string, string]> = {
    scheduled: ["blue", "Scheduled"],
    in_progress: ["warn", "In progress"],
    completed: ["good", "Completed"],
    canceled: ["gray", "Canceled"],
  };
  const [c, t] = map[status];
  return <span className={`badge ${c}`}>{t}</span>;
}

export function InvoiceBadge({ status, overdue, partial }: { status: InvoiceStatus; overdue?: boolean; partial?: boolean }) {
  if (status === "paid") return <span className="badge good">Paid</span>;
  if (status === "void") return <span className="badge gray">Void</span>;
  if (status === "draft") return <span className="badge gray">Draft</span>;
  if (overdue) return <span className="badge bad">Overdue</span>;
  if (partial) return <span className="badge warn">Partial</span>;
  return <span className="badge blue">Unpaid</span>;
}

/* ---------- Bar chart (SVG) ---------- */
export function BarChart({ data }: { data: Bar[] }) {
  const W = 600;
  const H = 170;
  const padTop = 22;
  const padBottom = 22;
  const max = Math.max(1, ...data.map((d) => d.value));
  const slot = W / data.length;
  const bw = Math.min(34, slot * 0.62);
  const ch = H - padTop - padBottom;
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Earnings chart">
      {data.map((d, i) => {
        const h = Math.max(d.value > 0 ? 3 : 0, (d.value / max) * ch);
        const x = i * slot + (slot - bw) / 2;
        const y = padTop + ch - h;
        return (
          <g key={i}>
            <rect className={`bar${d.current ? " cur" : ""}`} x={x} y={y} width={bw} height={h} rx={6} />
            {d.value > 0 && (data.length <= 8 || d.current) && (
              <text className="bar-val" x={x + bw / 2} y={y - 6}>{moneyShort(d.value)}</text>
            )}
            <text className="bar-label" x={x + bw / 2} y={H - 6}>{d.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

export const Spinner = () => <div className="spinner" aria-label="Loading" />;
