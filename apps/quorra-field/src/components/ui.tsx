import { createContext, useCallback, useContext, useEffect, useRef, useState, type InputHTMLAttributes, type ReactNode } from "react";
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

/* ---------- Confirm (replaces the browser's confirm box) ---------- */
export type ConfirmOptions = { title: string; message?: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean };
type ConfirmFn = (o: ConfirmOptions) => Promise<boolean>;
const ConfirmCtx = createContext<ConfirmFn>(() => Promise.resolve(false));
export const useConfirm = () => useContext(ConfirmCtx);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [ask, setAsk] = useState<{ o: ConfirmOptions; done(v: boolean): void } | null>(null);
  const confirm = useCallback<ConfirmFn>((o) => new Promise<boolean>((resolve) => setAsk({ o, done: resolve })), []);
  const finish = (v: boolean) => {
    ask?.done(v);
    setAsk(null);
  };
  useEffect(() => {
    if (!ask) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { ask.done(false); setAsk(null); }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [ask]);
  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      {ask && (
        <div className="overlay confirm-overlay" onMouseDown={(e) => e.target === e.currentTarget && finish(false)}>
          <div className="confirm" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby={ask.o.message ? "confirm-msg" : undefined}>
            <h2 id="confirm-title">{ask.o.title}</h2>
            {ask.o.message && <p id="confirm-msg">{ask.o.message}</p>}
            <div className="confirm-actions">
              <button className="btn grow" onClick={() => finish(false)}>{ask.o.cancelLabel ?? "Cancel"}</button>
              <button className={`btn grow ${ask.o.danger ? "danger-solid" : "primary"}`} autoFocus onClick={() => finish(true)}>{ask.o.confirmLabel ?? "Confirm"}</button>
            </div>
          </div>
        </div>
      )}
    </ConfirmCtx.Provider>
  );
}

/* ---------- Sheet (modal) ---------- */
export function Sheet({ title, onClose, children }: { title: string; onClose(): void; children: ReactNode }) {
  const confirm = useConfirm();
  const dirty = useRef(false);
  const closeRef = useRef<() => void>(() => {});
  /** Closing by hand (X, outside tap, Escape) asks first if something was typed and not saved. */
  closeRef.current = async () => {
    if (dirty.current && !(await confirm({ title: "Leave without saving?", message: "You have changes that are not saved. If you leave now they will be lost.", confirmLabel: "Leave without saving", cancelLabel: "Keep editing" }))) return;
    onClose();
  };
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeRef.current();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, []);
  const mark = (e: React.SyntheticEvent) => {
    const t = e.target as HTMLElement;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) && !(t as HTMLInputElement).readOnly && !t.hasAttribute("data-nodirty") && (t as HTMLInputElement).type !== "file") dirty.current = true;
  };
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && closeRef.current()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onInput={mark} onChange={mark}>
        <div className="sheet-head">
          <h2>{title}</h2>
          <button className="x" onClick={() => closeRef.current()} aria-label="Close">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** A numbered step heading used to break the setup into short sections. */
export function Step({ n, title, hint, children }: { n?: number; title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="set-sec">
      <div className="set-head">{n ? <i>{n}</i> : null}{title}</div>
      {hint && <p className="set-hint">{hint}</p>}
      {children}
    </section>
  );
}

/** Password box with an eye button to show or hide what was typed. */
export function PasswordInput(props: Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  const [show, setShow] = useState(false);
  return (
    <div className="pw">
      <input {...props} className="input" type={show ? "text" : "password"} />
      <button type="button" className="pw-eye" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide password" : "Show password"} aria-pressed={show} tabIndex={-1}>
        {show ? (
          <svg viewBox="0 0 24 24" {...P}><path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>
        ) : (
          <svg viewBox="0 0 24 24" {...P}><path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z" /><circle cx="12" cy="12" r="3" /><path d="M4 20L20 4" strokeWidth={2.4} /></svg>
        )}
      </button>
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
  const ref = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(600);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(Math.max(240, el.clientWidth)));
    ro.observe(el);
    setW(Math.max(240, el.clientWidth));
    return () => ro.disconnect();
  }, []);
  const H = 190;
  const padTop = 26;
  const padBottom = 26;
  const max = Math.max(1, ...data.map((d) => d.value));
  const slot = W / data.length;
  const bw = Math.min(40, slot * 0.6);
  const ch = H - padTop - padBottom;
  const showVals = slot >= 52;
  const every = slot < 30 ? 2 : 1;
  return (
    <div ref={ref} style={{ width: "100%" }}>
      <svg className="chart" width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Revenue chart">
        {data.map((d, i) => {
          const h = Math.max(d.value > 0 ? 3 : 0, (d.value / max) * ch);
          const x = i * slot + (slot - bw) / 2;
          const y = padTop + ch - h;
          return (
            <g key={i}>
              <rect className={`bar${d.current ? " cur" : ""}`} x={x} y={y} width={bw} height={h} rx={6} />
              {d.value > 0 && (showVals || d.current) && <text className="bar-val" x={x + bw / 2} y={y - 6}>{moneyShort(d.value)}</text>}
              {(i % every === 0 || d.current) && <text className="bar-label" x={x + bw / 2} y={H - 8}>{d.label}</text>}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export const Spinner = () => <div className="spinner" aria-label="Loading" />;
