import { useState } from "react";
import { useData } from "../lib/app";
import type { jsPDF } from "jspdf";
import { Sheet, useToast } from "./ui";
import { hasSupabase, supabase } from "../lib/supabase";
import { savePdf } from "../lib/pdf";
import { sendDoc } from "../lib/sendDoc";

type Mode = "portal" | "plain" | "pdf";

/** Send a quote or invoice. Step 1: pick Customer Portal, Plain Text or PDF. Step 2: copy, text or email it. Any send marks it as sent and closes. */
export default function SendSheet({ kind = "quote", title, filename, makePdf, to: toAddr, phone, subject, body, portalLink, docTitle, amount, validUntil, onConfirm, onClose }: {
  kind?: "quote" | "invoice"; title: string; filename: string; makePdf(): jsPDF | Promise<jsPDF>; to?: string; phone?: string; subject: string; body: string; portalLink?: string;
  docTitle: string; amount?: string; validUntil?: string; confirmLabel?: string; onConfirm?(): Promise<void>; onClose(): void;
}) {
  const toast = useToast();
  const { business } = useData();
  const [mode, setMode] = useState<Mode | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const noun = kind === "invoice" ? "invoice" : "quote";
  const enc = encodeURIComponent;
  const plain = `${body}${amount ? `\n\nTotal: ${amount}` : ""}`;
  const portalText = `${subject}${amount ? ` (${amount})` : ""}: ${portalLink ?? ""}`.trim();
  const message = mode === "portal" ? portalText : mode === "plain" ? plain : `${subject}. PDF attached.`;

  async function sent(what: string) {
    try { if (onConfirm) await onConfirm(); } catch { /* the message already went */ }
    toast(what);
    onClose();
  }

  async function copy() {
    try {
      if (mode === "pdf") { await savePdf(await makePdf(), filename); return void sent("PDF saved. Marked as sent"); }
      await navigator.clipboard.writeText(mode === "portal" ? portalLink ?? message : message);
      void sent(mode === "portal" ? "Link copied. Marked as sent" : "Copied. Marked as sent");
    } catch { toast("Copy failed. Select the text and copy it."); }
  }

  async function email() {
    setProblem(null);
    if (!toAddr) return setProblem("No email on file for this customer.");
    if (mode === "plain") { window.location.href = `mailto:${toAddr}?subject=${enc(subject)}&body=${enc(plain)}`; return void sent("Email opened. Marked as sent"); }
    if (!hasSupabase || !supabase) return toast("Demo mode: nothing is sent.");
    setBusy(true);
    try {
      const withPdf = mode === "pdf";
      const pdf_base64 = withPdf ? (await makePdf()).output("datauristring").split(",")[1] : undefined;
      const { data, error } = await supabase.functions.invoke("send-document", { body: { kind, to: toAddr, phone, link: withPdf ? undefined : portalLink, subject, doc_title: docTitle, amount, valid_until: validUntil, channels: { email: true, text: false }, pdf_base64, filename } });
      if (error) { let m = error.message; try { const ctx = (error as { context?: Response }).context; if (ctx) m = (await ctx.json()).error ?? m; } catch { /* ignore */ } throw new Error(m); }
      const em = data?.email as { sent: boolean; reason?: string } | undefined;
      if (!em?.sent) throw new Error(em?.reason ?? "Email did not send");
      await sent(`${noun[0].toUpperCase() + noun.slice(1)} emailed. Marked as sent`);
    } catch (e) { setProblem(e instanceof Error ? e.message : "Could not send"); } finally { setBusy(false); }
  }

  async function shareOrText() {
    if (mode === "pdf") { const r = await sendDoc({ pdf: await makePdf(), filename, channel: "text", to: phone, subject, body: message }); if (r === "cancelled") return; if (r === "downloaded") toast("PDF saved. Attach it to your text."); return void sent("Marked as sent"); }
  }

  const modes: { id: Mode; label: string; hint: string }[] = [
    { id: "portal", label: "Customer portal", hint: kind === "quote" ? "A link where they accept it and pick a time" : "A link where they view it and pay by card" },
    { id: "plain", label: "Plain text", hint: "The details written out in a simple message" },
    { id: "pdf", label: "PDF", hint: "A PDF copy of the document" },
  ];

  return (
    <Sheet title={title} onClose={onClose}>
      <div className="stack">
        {!mode ? (
          <>
            <div className="small muted">How do you want to send this {noun}?</div>
            {modes.map((m) => (
              <button key={m.id} className="send-pick" style={{ textAlign: "left" }} onClick={() => { setMode(m.id); setProblem(null); }}>
                <span><b>{m.label}</b><br /><span className="small muted">{m.hint}</span></span>
              </button>
            ))}
            {onConfirm && <button className="btn block" style={{ background: "#16a34a", color: "#fff", borderColor: "#16a34a" }} onClick={() => void sent("Marked as sent")}>I sent it another way</button>}
          </>
        ) : (
          <>
            <button className="btn" onClick={() => setMode(null)} style={{ alignSelf: "flex-start" }}>Back</button>
            <div className="small muted">{modes.find((m) => m.id === mode)?.label}: {mode === "pdf" ? "email it, or save it to share." : "copy it, text it, or email it."}</div>
            {mode !== "pdf" && <div className="small" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", wordBreak: "break-word", padding: 10, border: "1px solid var(--line, #ddd)", borderRadius: 8 }}>{message}</div>}
            {mode !== "pdf" && business.text_number && <div className="small muted">Texting from {business.text_number}: tap Copy, then paste it into your Quo app. "Text from my phone" uses this phone's own number.</div>}
            {problem && <div className="error-banner" style={{ margin: 0 }}>{problem}</div>}
            <div className="grid2 stack-sm">
              <button className="btn" onClick={() => void copy()}>{mode === "pdf" ? "Download" : mode === "portal" ? "Copy link" : "Copy text"}</button>
              {mode === "pdf"
                ? <button className="btn" onClick={() => void shareOrText()}>Share or text</button>
                : <a className="btn" href={`sms:${phone ?? ""}?&body=${enc(message)}`} onClick={() => void sent("Messages opened. Marked as sent")}>Text from my phone</a>}
            </div>
            <button className="btn primary block" disabled={busy || !toAddr} onClick={() => void email()}>{busy ? "Sending..." : toAddr ? `Email to ${toAddr}` : "No email on file"}</button>
            {onConfirm && <button className="btn block" style={{ background: "#16a34a", color: "#fff", borderColor: "#16a34a" }} onClick={() => void sent("Marked as sent")}>I sent it another way</button>}
          </>
        )}
      </div>
    </Sheet>
  );
}
