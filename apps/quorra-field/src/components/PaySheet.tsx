import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { Icon, Sheet, useToast } from "./ui";
import { useData } from "../lib/app";
import type { Customer, Invoice, PayMethod } from "../lib/types";
import { money } from "../lib/money";

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
      .catch((e) => live && setErr(e instanceof Error ? e.message : "Could not create a payment link"));
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
            <p className="muted small" style={{ textAlign: "center" }}>
              Hand the customer your phone, or have them scan this code to pay on their own phone. Apple Pay and Google Pay work too.
            </p>
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
              <div className="stack">
                <a className="btn primary block" href={link.url} target="_blank" rel="noopener">{Icon.card} Open checkout on this phone</a>
                <button className="btn block" onClick={async () => { await refresh(); toast("Refreshed"); }}>I've been paid, refresh</button>
              </div>
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
  const { store, refresh } = useData();
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
      await refresh();
      toast(cents === balance ? "Invoice marked paid" : `${money(cents)} recorded`);
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not record payment");
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
