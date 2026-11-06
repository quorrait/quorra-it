import { useState } from "react";
import type { jsPDF } from "jspdf";
import { Sheet, useToast } from "./ui";
import { sendDoc, type Channel } from "../lib/sendDoc";
import { savePdf } from "../lib/pdf";

/** Send a document to the customer with its PDF attached. */
export default function SendSheet({ title, filename, makePdf, to, phone, subject, body, confirmLabel, onConfirm, onClose }: {
  title: string; filename: string; makePdf(): jsPDF; to?: string; phone?: string; subject: string; body: string;
  confirmLabel?: string; onConfirm?(): Promise<void>; onClose(): void;
}) {
  const toast = useToast();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function go(channel: Channel) {
    const r = await sendDoc({ pdf: makePdf(), filename, channel, to: channel === "email" ? to : phone, subject, body });
    if (r === "downloaded") setNote("The PDF was saved to this device and your message app opened. Attach the saved PDF to the message before sending.");
    else if (r === "shared") setNote("Choose Mail or Messages in the share sheet. The PDF is attached.");
  }

  return (
    <Sheet title={title} onClose={onClose}>
      <div className="stack">
        <button className="btn primary block" onClick={() => void go("email")}>Email with PDF</button>
        <button className="btn primary block" onClick={() => void go("text")}>Text with PDF</button>
        <button className="btn block" onClick={() => void savePdf(makePdf(), filename)}>Download PDF only</button>
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
