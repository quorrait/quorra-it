import type { jsPDF } from "jspdf";

export type Channel = "email" | "text";

/**
 * Send a PDF to a customer.
 * On a phone, the share sheet attaches the PDF and the person picks Mail or Messages.
 * Where file sharing is not available (most computers), the PDF is downloaded and the
 * email or text app opens with the message ready, so the PDF can be attached by hand.
 * Returns what happened so the screen can tell the person.
 */
export async function sendDoc(o: { pdf: jsPDF; filename: string; channel: Channel; to?: string; subject: string; body: string }): Promise<"shared" | "downloaded" | "cancelled"> {
  const blob = o.pdf.output("blob");
  const file = new File([blob], o.filename, { type: "application/pdf" });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: o.subject, text: o.body });
      return "shared";
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return "cancelled";
    }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = o.filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  const to = o.to ?? "";
  window.location.href = o.channel === "email"
    ? `mailto:${to}?subject=${encodeURIComponent(o.subject)}&body=${encodeURIComponent(o.body)}`
    : `sms:${to}?&body=${encodeURIComponent(o.body)}`;
  return "downloaded";
}
