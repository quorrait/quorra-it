// Editable customer emails. Keep this file identical to src/lib/emailTemplates.ts.
export type TplKey = "reminder" | "quote" | "invoice" | "nudge";
export interface Tpl { subject: string; heading: string; message: string }

export const TPL_LABEL: Record<TplKey, { name: string; when: string }> = {
  reminder: { name: "Appointment reminder", when: "Sent automatically before a scheduled visit." },
  quote: { name: "Quote", when: "Sent when you email a quote to a customer." },
  invoice: { name: "Invoice", when: "Sent when you email an invoice to a customer." },
  nudge: { name: "Schedule your visit", when: "Sent when a customer accepted a quote but has not picked a time yet." },
};

export const TPL_VARS = ["customer", "business", "service", "date", "time", "address", "phone", "total"];

export const TPL_DEFAULTS: Record<TplKey, Tpl> = {
  reminder: {
    subject: "Appointment reminder: {service} on {date}",
    heading: "Your appointment is coming up",
    message: "Hi {customer},\n\nThis is a friendly reminder of your upcoming appointment with {business}.\n\nWe look forward to seeing you on {date} at {time}. If you need to reschedule, please call us at {phone}.\n\nThank you for choosing {business}.",
  },
  quote: {
    subject: "Your quote from {business}: {total}",
    heading: "Your quote is ready",
    message: "Hi {customer},\n\nThank you for the opportunity to work with you. Your quote for {service} is ready to review. You can accept it online and choose a time that suits you.\n\nIf you have any questions, just reply to this email.",
  },
  invoice: {
    subject: "Invoice from {business}: {total}",
    heading: "Your invoice is ready",
    message: "Hi {customer},\n\nThank you for your business. Your invoice for {service} is ready. You can view it and pay securely online.\n\nIf you have any questions, just reply to this email.",
  },
  nudge: {
    subject: "Choose a time for your {service}",
    heading: "Let's get you scheduled",
    message: "Hi {customer},\n\nThank you for accepting our quote for {service}. To reserve your visit, please choose a day and time that works for you.\n\nIf you would rather schedule by phone, call us at {phone}.",
  },
};

/** The business's saved wording, falling back to the default for anything left blank. */
export function getTpl(saved: unknown, key: TplKey): Tpl {
  const s = (saved as Record<string, Partial<Tpl>> | null | undefined)?.[key] ?? {};
  const d = TPL_DEFAULTS[key];
  return { subject: s.subject?.trim() || d.subject, heading: s.heading?.trim() || d.heading, message: s.message?.trim() || d.message };
}

/** Swap {customer}, {date} and the other placeholders for real values. Unknown or empty ones are removed cleanly. */
export function fill(text: string, vars: Record<string, string | undefined>): string {
  return text.replace(/\{(\w+)\}/g, (_m, k: string) => vars[k] ?? "").replace(/ {2,}/g, " ").replace(/ ([.,!?])/g, "$1");
}
