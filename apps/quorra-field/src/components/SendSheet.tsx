import { useState } from "react";
import type { jsPDF } from "jspdf";
import { Sheet, useToast } from "./ui";
import { hasSupabase, supabase } from "../lib/supabase";
import { savePdf } from "../lib/pdf";
import { sendDoc } from "../lib/sendDoc";

interface Result { sent: boolean; reason?: string }

/** Send a quote or invoice: pick email and/or text, and one button sends a clean message with a link. Other ways are tucked underneath. */
export default function SendSheet({ kind = "quote", title, filename, makePdf, to: toAddr, phone, subject, body, portalLink, docTitle, amount, validUntil, onConfirm, onClose }: {
  kind?: "quote" | "invoice"; title: string; filename: string; makePdf(): jsPDF | Promise<jsPDF>; to?: string; phone?: string; subject: string; body: string; portalLink?: string;
  docTitle: string; amount?: string; validUntil?: string; confirmLabel?: string; onConfirm?(): Promise<void>; onClose(): void;
}) {
  const toast = useToast();
  const [email, setEmail] = useState(Boolean(toAddr));
  const [text, setText] = useState(!toAddr && Boolean(phone));
  const [pdf, setPdf] = useState(kind === "invoice");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [fallbackText, setFallbackText] = useState(false);
  const noun = kind === "invoice" ? "invoice" : "quote";
  const withLink = portalLink ? `${body}\n\nOpen it online: ${portalLink}` : body;
  const smsBody = `${subject}${amount ? ` (${amount})` : ""}: ${portalLink ?? ""}`.trim();

  async function send() {
    setProblem(null); setFallbackText(false);
    if (!email && !text) return setProblem("Pick email, text, or both.");
    if (!hasSupabase || !supabase) { // demo: nothing can really be sent
      return toast("Demo mode: nothing is sent. Use Other ways to send below.");
    }
    setBusy(true);
    try {
      let pdf_base64: string | undefined;
      if (pdf && email) pdf_base64 = (await makePdf()).output("datauristring").split(",")[1];
      const { data, error } = await supabase.functions.invoke("send-document", { body: { kind, to: toAddr, phone, link: portalLink, subject, doc_title: docTitle, amount, valid_until: validUntil, channels: { email, text }, pdf_base64, filename } });
      if (error) { let m = error.message; try { const ctx = (error as { context?: Response }).context; if (ctx) m = (await ctx.json()).error ?? m; } catch { /* ignore */ } throw new Error(m); }
      const em = data?.email as Result | undefined, tx = data?.text as Result | undefined;
      const problems: string[] = [];
      if (em && !em.sent) problems.push(`Email did not send: ${em.reason ?? "unknown error"}`);
      if (tx && !tx.sent) { problems.push(`Text did not send: ${tx.reason ?? "unknown error"}`); setFallbackText(true); }
      const ok = [em, tx].some((r) => r?.sent);
      if (ok) {
        toast(em?.sent && tx?.sent ? `${noun[0].toUpperCase() + noun.slice(1)} emailed and texted` : em?.sent ? `${noun[0].toUpperCase() + noun.slice(1)} emailed` : `${noun[0].toUpperCase() + noun.slice(1)} texted`);
        if (onConfirm) await onConfirm();
      }
      if (problems.length) setProblem(problems.join(" "));
      else if (ok) onClose();
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "Could not send");
    } finally { setBusy(false); }
  }

  const enc = encodeURIComponent;
  const gmail = `https://mail.google.com/mail/?view=cm&fs=1&to=${enc(toAddr ?? "")}&su=${enc(subject)}&body=${enc(withLink)}`;
  const outlook = `https://outlook.office.com/mail/deeplink/compose?to=${enc(toAddr ?? "")}&subject=${enc(subject)}&body=${enc(withLink)}`;
  const mailto = `mailto:${toAddr ?? ""}?subject=${enc(subject)}&body=${enc(withLink)}`;

  return (
    <Sheet title={title} onClose={onClose}>
      <div className="stack">
        <div className="small muted">Your customer gets a link to the {noun} online{kind === "quote" ? ", where they can accept it and pick a time" : ", where they can pay by card"}.</div>

        <label className={`send-pick${email ? " on" : ""}`}>
          <input type="checkbox" checked={email} disabled={!toAddr} onChange={(e) => setEmail(e.target.checked)} />
          <span><b>Email</b><br /><span className="small muted">{toAddr || "No email on file for this customer"}</span></span>
        </label>
        <label className={`send-pick${text ? " on" : ""}`}>
          <input type="checkbox" checked={text} disabled={!phone} onChange={(e) => setText(e.target.checked)} />
          <span><b>Text message</b><br /><span className="small muted">{phone || "No phone on file for this customer"}</span></span>
        </label>
        {email && <label className="check-row"><input type="checkbox" checked={pdf} onChange={(e) => setPdf(e.target.checked)} /> Also attach a PDF copy to the email</label>}

        {problem && <div className="error-banner" style={{ margin: 0 }}>{problem}</div>}
        {fallbackText && <a className="btn block" href={`sms:${phone ?? ""}?&body=${enc(smsBody)}`}>Open my Messages app instead</a>}
        <button className="btn primary block" disabled={busy || (!email && !text)} onClick={() => void send()}>{busy ? "Sending..." : `Send ${noun}`}</button>

        <details className="send-more">
          <summary>Other ways to send</summary>
          <div className="stack" style={{ marginTop: 10 }}>
            <button className="btn block" onClick={async () => { try { await navigator.clipboard.writeText(portalLink ?? ""); toast("Link copied"); } catch { toast("Copy failed. Select the link and copy it."); } }}>Copy link</button>
            <div className="grid2 stack-sm">
              <a className="btn" href={gmail} target="_blank" rel="noreferrer">Write in Gmail</a>
              <a className="btn" href={outlook} target="_blank" rel="noreferrer">Write in Outlook</a>
            </div>
            <a className="btn block" href={mailto}>Open my mail app</a>
            <button className="btn block" onClick={async () => { const r = await sendDoc({ pdf: await makePdf(), filename, channel: "email", to: toAddr, subject, body: withLink }); if (r === "downloaded") toast("PDF saved. Attach it to the message."); }}>Share the PDF</button>
            <button className="btn block" onClick={async () => void savePdf(await makePdf(), filename)}>Download the PDF</button>
            {onConfirm && <button className="btn block" onClick={async () => { await onConfirm(); toast("Marked as sent"); onClose(); }}>I sent it another way, mark as sent</button>}
          </div>
        </details>
      </div>
    </Sheet>
  );
}
