import { Capacitor } from "@capacitor/core";
import { errMsg } from "../lib/errors";
import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { Icon, Sheet, useToast } from "./ui";
import { useData } from "../lib/app";
import type { Customer, Invoice, PayMethod } from "../lib/types";
import { money } from "../lib/money";
import { tapToPayMessage, tapToPayOffer } from "../lib/tapToPay";
import { cancelTap, collectTapToPay, onReaderProgress, openAppSettings } from "../lib/terminalPay";

/** Card payment: hosted checkout link + QR the customer can scan with their own phone. */
export function CardPaySheet({ invoice, customer, balance, onClose }: { invoice: Invoice; customer?: Customer; balance: number; onClose(): void }) {
  const { store, refresh } = useData();
  const toast = useToast();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [link, setLink] = useState<{ url: string; demo: boolean } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    let live = true;
    store
      .createPayLink(invoice.id)
      .then((l) => live && setLink(l))
      .catch((e) => live && setErr(errMsg(e, "Could not create a payment link")));
    return () => {
      live = false;
    };
  }, [store, invoice.id]);

  useEffect(() => {
    if (link && canvas.current) void QRCode.toCanvas(canvas.current, link.url, { width: 220, margin: 1 });
  }, [link]);

  async function simulate() {
    setPaying(true);
    try {
      await new Promise((r) => setTimeout(r, 900));
      await store.recordPayment({ invoice_id: invoice.id, amount_cents: balance, method: "card" });
      await refresh();
      toast(`${money(balance)} paid by card`);
      onClose();
    } finally {
      setPaying(false);
    }
  }

  const smsBody = encodeURIComponent(`Hi ${customer?.name.split(" ")[0] ?? "there"}, here's your secure payment link for invoice #${invoice.number} (${money(balance)}): ${link?.url ?? ""}`);

  return (
    <Sheet title={`Pay ${money(balance)} by card`} onClose={onClose}>
      <div className="stack">
        {err && <div className="error-banner" style={{ margin: 0 }}>{err}</div>}
        {!link && !err && <div className="spinner" />}
        {link && (
          <>
            <p className="muted small" style={{ textAlign: "center", margin: 0 }}>Have the customer scan to pay.</p>
            <p className="small muted" style={{ textAlign: "center", margin: 0 }}>Text the link instead.</p>
            <div className="qr"><canvas ref={canvas} width={220} height={220} /></div>

            {link.demo ? (
              <div className="stack">
                <div className="fake-card">
                  <div className="row between"><span className="demo-tag">Demo</span><span className="small">Simulated checkout</span></div>
                  <div style={{ fontSize: 18, letterSpacing: 2, margin: "16px 0 6px" }} className="num">4242 4242 4242 4242</div>
                  <div className="small" style={{ opacity: 0.75 }}>Test card · no real charge</div>
                </div>
                <button className="btn good block" onClick={simulate} disabled={paying} style={{ minHeight: 54 }}>
                  {paying ? "Processing..." : `Simulate customer paying ${money(balance)}`}
                </button>
              </div>
            ) : (
              <button className="btn block" onClick={async () => { await refresh(); toast("Refreshed"); }}>I've been paid, refresh</button>
            )}

            <div className="grid2">
              <a className="btn" href={`sms:${customer?.phone ?? ""}?&body=${smsBody}`}>{Icon.send} Text link</a>
              <button className="btn" onClick={async () => { await navigator.clipboard?.writeText(link.url); toast("Link copied"); }}>Copy link</button>
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
}

/** Cash / check / other payments entered by hand. */
export function ManualPaySheet({ invoice, balance, onClose }: { invoice: Invoice; balance: number; onClose(): void }) {
  const { store, refresh, jobs, leads } = useData();
  const toast = useToast();
  const [method, setMethod] = useState<PayMethod>("cash");
  const [amount, setAmount] = useState((balance / 100).toFixed(2));
  const [busy, setBusy] = useState(false);

  async function save() {
    const cents = Math.round(parseFloat(amount) * 100);
    if (!cents || cents <= 0) return toast("Enter an amount");
    if (cents > balance) return toast(`That's more than the ${money(balance)} due`);
    setBusy(true);
    try {
      if (invoice.status === "draft") await store.saveInvoice({ ...invoice, status: "sent" });
      await store.recordPayment({ invoice_id: invoice.id, amount_cents: cents, method });
      if (cents === balance && invoice.job_id) {
        // Paid in full: the job is done and the work order leaves the list (the database does this too).
        const job = jobs.find((j) => j.id === invoice.job_id);
        if (job && job.status !== "completed" && job.status !== "canceled") await store.saveJob({ ...job, status: "completed" }).catch(() => undefined);
        for (const l of leads.filter((x) => x.job_id === invoice.job_id && x.stage === "work_order")) await store.saveRow("leads", { ...l, stage: "completed" }).catch(() => undefined);
      }
      await refresh();
      toast(cents === balance ? "Invoice marked paid" : `${money(cents)} recorded`);
      onClose();
    } catch (e) {
      toast(errMsg(e, "Could not record payment"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet title="Mark paid" onClose={onClose}>
      <div className="stack">
        <div className="chips">
          {(["cash", "check", "other"] as PayMethod[]).map((m) => (
            <button key={m} className={`chip${method === m ? " on" : ""}`} onClick={() => setMethod(m)}>{m === "other" ? "Other (Zelle, Venmo...)" : m[0].toUpperCase() + m.slice(1)}</button>
          ))}
        </div>
        <label className="field">
          <span>Amount received (balance due {money(balance)})</span>
          <input className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
        <button className="btn good block" onClick={save} disabled={busy}>{busy ? "Saving..." : "Mark paid"}</button>
      </div>
    </Sheet>
  );
}

function TapPaySheet({ invoiceId, businessName, onClose, onPaid }: { invoiceId: string; businessName: string; onClose(): void; onPaid(): void }) {
  const [status, setStatus] = useState("Getting Tap to Pay ready...");
  const [progress, setProgress] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const ios = Capacitor.getPlatform() === "ios";
  const [accepted, setAccepted] = useState(() => { try { return localStorage.getItem("qd-tap-terms") === "1"; } catch { return false; } });
  const [ready, setReady] = useState(!ios || accepted);
  const paid = useRef(onPaid);
  paid.current = onPaid;
  useEffect(() => {
    if (!ready) return;
    let stop = false;
    const unlisten = onReaderProgress((n) => { if (!stop) setProgress(n); });
    collectTapToPay(invoiceId, businessName, (message) => { if (!stop) setStatus(message); })
      .then(() => { if (!stop) void paid.current(); })
      .catch((e) => { if (!stop) setErr(tapToPayMessage(e instanceof Error ? e.message : "Tap to Pay didn't go through.")); });
    return () => { stop = true; unlisten(); void cancelTap(); };
  }, [invoiceId, businessName, ready]);
  function close() { void cancelTap(); onClose(); }
  if (!ready) return (
    <Sheet title="Tap to Pay on iPhone" onClose={close}>
      <div className="stack">
        <p style={{ margin: 0 }}>Tap to Pay on iPhone lets a customer pay by holding their card to the top of this phone. You do not need a card reader.</p>
        <p className="small muted" style={{ margin: 0 }}>The first time, Apple downloads a small configuration. Keep the phone unlocked until it finishes. The name on the terms is {businessName || "your business"}.</p>
        <label className="check-row"><input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} /> I am the account owner or a manager, and I accept the Tap to Pay terms.</label>
        <button className="btn primary block" disabled={!accepted} onClick={() => { try { localStorage.setItem("qd-tap-terms", "1"); } catch { /* ignore */ } setReady(true); }}>Continue</button>
      </div>
    </Sheet>
  );
  return (
    <Sheet title="Tap to Pay" onClose={close}>
      <div className="stack">
        {!err && <p style={{ margin: 0 }}>{status}</p>}
        {progress != null && progress < 1 && <progress value={progress} max={1} style={{ width: "100%" }} />}
        {err && <div className="error-banner" style={{ margin: 0 }}>{err}</div>}
        {err && /settings/i.test(err) && <button className="btn block" onClick={openAppSettings}>Open Settings</button>}
        {err && <button className="btn block" onClick={close}>Use the QR code</button>}
      </div>
    </Sheet>
  );
}

/** First step of taking payment on the spot: cash/check or card. */
export function TakePaymentSheet({ invoice, customer, balance, onClose }: { invoice: Invoice; customer?: Customer; balance: number; onClose(): void }) {
  const { store, refresh, business } = useData();
  const toast = useToast();
  const offer = tapToPayOffer();
  const [step, setStep] = useState<"pick" | "cash" | "card-how" | "card" | "tap">("pick");
  const [busy, setBusy] = useState(false);

  async function ensureSent(next: "cash" | "card-how") {
    setBusy(true);
    try {
      if (invoice.status === "draft") { await store.saveInvoice({ ...invoice, status: "sent" }); await refresh(); }
      setStep(next);
    } catch (e) {
      toast(errMsg(e, "Could not start payment"));
    } finally {
      setBusy(false);
    }
  }

  async function chooseCard() {
    setBusy(true);
    try {
      if (invoice.status === "draft") { await store.saveInvoice({ ...invoice, status: "sent" }); await refresh(); }
      setStep(offer === "hidden" ? "card" : "card-how");
    } catch (e) {
      toast(errMsg(e, "Could not start payment"));
    } finally {
      setBusy(false);
    }
  }

  if (step === "cash") return <ManualPaySheet invoice={{ ...invoice, status: "sent" }} balance={balance} onClose={onClose} />;
  if (step === "card") return <CardPaySheet invoice={{ ...invoice, status: "sent" }} customer={customer} balance={balance} onClose={onClose} />;
  if (step === "tap") return <TapPaySheet invoiceId={invoice.id} businessName={business.name} onClose={() => setStep("card-how")} onPaid={async () => { await refresh(); toast("Payment received"); onClose(); }} />;
  if (step === "card-how") return (
    <Sheet title={`Card · ${money(balance)}`} onClose={onClose}>
      <div className="stack">
        <button className="btn primary block" style={{ minHeight: 64 }} onClick={() => setStep("card")}>{Icon.card} QR code</button>
        <p className="small muted" style={{ margin: 0 }}>Have the customer scan to pay.</p>
        {offer === "ready" && <button className="btn block" style={{ minHeight: 64 }} onClick={() => setStep("tap")}>Tap to Pay</button>}
        {offer === "soon" && <button className="btn block" style={{ minHeight: 64 }} disabled>Tap to Pay, coming soon</button>}
      </div>
    </Sheet>
  );
  return (
    <Sheet title={`Take payment · ${money(balance)}`} onClose={onClose}>
      <div className="stack">
        <button className="btn good block" style={{ minHeight: 64 }} disabled={busy} onClick={() => void ensureSent("cash")}>{Icon.check} Cash, check or other</button>
        <button className="btn primary block" style={{ minHeight: 64 }} disabled={busy} onClick={() => void chooseCard()}>{Icon.card} Card</button>
        <p className="small muted" style={{ margin: 0 }}>{offer === "hidden" ? "Card: the customer scans a QR code on their own phone." : "Card: the customer scans a QR code, or taps their card on this phone."}</p>
      </div>
    </Sheet>
  );
}
