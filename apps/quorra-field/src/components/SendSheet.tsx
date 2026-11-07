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

  return (
    <Sheet title={title} onClose={onClose}>
      <div className="stack">
        <button className="btn primary block" onClick={() => void go("email")}>Email with PDF</button>
        <button className="btn primary block" onClick={() => void go("text")}>Text with PDF</button>
        {portalLink && (
          <div className="stack" style={{ gap: 6 }}>
            <div className="bold small">With the customer portal link (no PDF)</div>
            <div className="grid2 stack-sm">
              <button className="btn block" onClick={() => plain("email", withLink)}>Email portal link</button>
              <button className="btn block" onClick={() => plain("text", withLink)}>Text portal link</button>
            </div>
            <div className="small muted">They open one private page to view, approve and pay.</div>
          </div>
        )}
        <div className="stack" style={{ gap: 6 }}>
          <div className="bold small">Message only (no PDF, no link)</div>
          <div className="grid2 stack-sm">
            <button className="btn block" onClick={() => plain("email", body)}>Email message</button>
            <button className="btn block" onClick={() => plain("text", body)}>Text message</button>
          </div>
        </div>
        <button className="btn block" onClick={async () => void savePdf(await makePdf(), filename)}>Download PDF only</button>
        {note ? <div className="notice">{note}</div> : <div className="small muted">On a phone, the PDF attaches automatically. On a computer, the PDF downloads and your email app opens so you can attach it.</div>}
        {onConfirm && (
          <button className="btn good block" disabled={busy} onClick={async () => { setBusy(true); try { await onConfirm(); toast("Marked as sent"); onClose(); } finally { setBusy(false); } }}>
            {confirmLabel ?? "Mark as sent"}
          </button>
        )}
      </div>
    </Sheet>
  );
}
