import { useState } from "react";
import type { jsPDF } from "jspdf";
import { Sheet, useToast } from "./ui";
import { sendDoc, type Channel } from "../lib/sendDoc";
import { savePdf } from "../lib/pdf";

/** Send a document to the customer with its PDF attached. */
export default function SendSheet({ title, filename, makePdf, to: toAddr, phone, subject, body, portalLink, confirmLabel, onConfirm, onClose }: {
  title: string; filename: string; makePdf(): jsPDF | Promise<jsPDF>; to?: string; phone?: string; subject: string; body: string; portalLink?: string;
  confirmLabel?: string; onConfirm?(): Promise<void>; onClose(): void;
}) {
  const toast = useToast();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function go(channel: Channel) {
    const r = await sendDoc({ pdf: await makePdf(), filename, channel, to: channel === "email" ? toAddr : phone, subject, body });
    if (r === "downloaded") setNote("The PDF was saved to this device and your message app opened. Attach the saved PDF to the message before sending.");
    else if (r === "shared") setNote("Choose Mail or Messages in the share sheet. The PDF is attached.");
  }

  /** Opens the phone's Messages or the email app with just text (no PDF). */
  function plain(channel: Channel, text: string) {
    const to = channel === "email" ? (toAddr ?? "") : (phone ?? "");
    window.location.href = channel === "email" ? `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}` : `sms:${to}?&body=${encodeURIComponent(text)}`;
  }
  const withLink = portalLink ? `${body}\n\nView and pay online: ${portalLink}` : body;

  const S = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const;
  const ico = {
    pdf: <svg viewBox="0 0 24 24" {...S}><path d="M6 3h8l5 5v13H6z" /><path d="M14 3v5h5M9 13h6M9 17h6" /></svg>,
    link: <svg viewBox="0 0 24 24" {...S}><path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1" /></svg>,
    msg: <svg viewBox="0 0 24 24" {...S}><path d="M4 5h16v11H9l-5 4z" /></svg>,
  };
  const Option = ({ icon, title, tag, desc, onEmail, onText, extra }: { extra?: JSX.Element; icon: JSX.Element; title: string; tag?: string; desc: string; onEmail(): void; onText(): void }) => (
    <div className="send-opt">
      <div className="send-opt-head">
        <span className="send-ico">{icon}</span>
        <div className="grow">
          <div className="send-title">{title}{tag && <span className="send-tag">{tag}</span>}</div>
          <div className="small muted">{desc}</div>
        </div>
      </div>
      <div className="grid2 stack-sm">
        <button className="btn" onClick={onEmail}>Email{toAddr ? "" : " (no email on file)"}</button>
        <button className="btn" onClick={onText}>Text{phone ? "" : " (no phone on file)"}</button>
      </div>
      {extra}
    </div>
  );

  return (
    <Sheet title={title} onClose={onClose}>
      <div className="stack">
        <div className="small muted">Sending to <b>{toAddr || "no email on file"}</b> · <b>{phone || "no phone on file"}</b>. Pick how you want it to arrive.</div>
        <Option icon={ico.pdf} title="PDF attached" desc="The invoice as a PDF file, looking exactly like your chosen layout." onEmail={() => void go("email")} onText={() => void go("text")} />
        {portalLink && <Option icon={ico.link} title="Customer portal link" tag="Easiest to get paid" desc="No file. They tap a link to view the invoice and pay online." onEmail={() => plain("email", withLink)} onText={() => plain("text", withLink)} extra={<button className="btn block" onClick={async () => { try { await navigator.clipboard.writeText(portalLink); toast("Portal link copied"); } catch { toast("Copy failed. Select the link and copy it."); } }}>Copy portal link</button>} />}
        <Option icon={ico.msg} title="Message only" desc="Just the short note with the amount. No PDF and no link." onEmail={() => plain("email", body)} onText={() => plain("text", body)} />
        {note ? <div className="notice">{note}</div> : <div className="small muted">On a phone the PDF attaches automatically. On a computer it downloads and your email app opens so you can attach it.</div>}
        <div className="row wrap" style={{ justifyContent: "space-between" }}>
          <button className="btn sm" onClick={async () => void savePdf(await makePdf(), filename)}>Just download the PDF</button>
        </div>
        {onConfirm && (
          <button className="btn good block" disabled={busy} onClick={async () => { setBusy(true); try { await onConfirm(); toast("Marked as sent"); onClose(); } finally { setBusy(false); } }}>
            {confirmLabel ?? "Mark as sent"}
          </button>
        )}
      </div>
    </Sheet>
  );
}
