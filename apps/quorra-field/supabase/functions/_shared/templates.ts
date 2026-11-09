// Editable customer emails. Keep this file identical to src/lib/emailTemplates.ts.
export type TplKey = "reminder" | "quote" | "invoice" | "nudge";
export interface Tpl { subject: string; heading: string; message: string }
export interface TplPreset extends Tpl { name: string }

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

/** Five ready-made wordings per email. The first one matches the default. */
export const TPL_PRESETS: Record<TplKey, TplPreset[]> = {
  reminder: [
    { name: "Professional", ...TPL_DEFAULTS.reminder },
    { name: "Friendly", subject: "See you {date}, {customer}!", heading: "We'll see you soon", message: "Hi {customer},\n\nJust a quick heads-up that we're coming by on {date} at {time} for your {service}.\n\nNeed to move it? Give us a call at {phone} and we'll sort it out.\n\nThanks,\n{business}" },
    { name: "Short and simple", subject: "Reminder: {date} at {time}", heading: "Appointment reminder", message: "Hi {customer}, this is a reminder of your {service} appointment on {date} at {time}. To reschedule, call {phone}.\n\n{business}" },
    { name: "Detailed", subject: "Your {service} appointment on {date}", heading: "Your appointment details", message: "Hi {customer},\n\nThis is a reminder of your upcoming appointment with {business}.\n\nService: {service}\nDate: {date}\nArrival time: {time}\nLocation: {address}\n\nPlease make sure someone over 18 is home and that we can reach the work area. If anything changes, call us at {phone} as early as you can.\n\nThank you,\n{business}" },
    { name: "Warm", subject: "Looking forward to seeing you, {customer}", heading: "We're looking forward to it", message: "Hi {customer},\n\nThank you for trusting {business} with your {service}. We have you down for {date} at {time}, and we're looking forward to taking care of you.\n\nIf anything comes up, call us any time at {phone}." },
  ],
  quote: [
    { name: "Professional", ...TPL_DEFAULTS.quote },
    { name: "Friendly", subject: "Your quote is ready, {customer}", heading: "Here's your quote", message: "Hi {customer},\n\nThanks for reaching out! We put together your quote for {service}. Take a look, and if it works for you, you can accept it online and pick a time.\n\nGot questions? Just reply to this email.\n\n{business}" },
    { name: "Short and simple", subject: "Quote from {business}: {total}", heading: "Quote ready", message: "Hi {customer}, your quote for {service} is ready. View it and accept online. Questions? Reply to this email." },
    { name: "Detailed", subject: "Quote for {service} from {business}", heading: "Your quote for {service}", message: "Hi {customer},\n\nThank you for the opportunity to earn your business. Your itemized quote for {service} totals {total}. It lists everything included, so there are no surprises.\n\nTo move forward, open the quote and select Accept. You can then choose a date and time for the work. If you would like to change anything first, reply to this email and we will update it.\n\nSincerely,\n{business}" },
    { name: "Warm", subject: "Thank you for thinking of us, {customer}", heading: "Thank you for thinking of us", message: "Hi {customer},\n\nIt was a pleasure meeting you. Your quote for {service} is ready, and we would be glad to get started whenever you are.\n\nAnything you'd like to talk through? Reply here or call us at {phone}." },
  ],
  invoice: [
    { name: "Professional", ...TPL_DEFAULTS.invoice },
    { name: "Friendly", subject: "Your invoice from {business}", heading: "Thanks for choosing us", message: "Hi {customer},\n\nThanks again for letting us help with {service}. Your invoice is ready. You can look it over and pay securely online in a minute.\n\nAnything look off? Reply to this email and we'll fix it.\n\n{business}" },
    { name: "Short and simple", subject: "Invoice: {total}", heading: "Invoice ready", message: "Hi {customer}, your invoice for {service} ({total}) is ready. Pay securely online using the button below." },
    { name: "Detailed", subject: "Invoice for {service}: {total} due", heading: "Invoice for {service}", message: "Hi {customer},\n\nYour invoice for {service} is attached below for your records. The balance due is {total}.\n\nYou can pay by card online with the button below, or contact us at {phone} to arrange another way to pay. Please keep this email for your records.\n\nThank you for your business,\n{business}" },
    { name: "Warm", subject: "Thank you, {customer}", heading: "Thank you for your business", message: "Hi {customer},\n\nIt was a pleasure working with you on {service}. Your invoice is ready whenever you are. Paying online takes just a moment.\n\nWe truly appreciate you choosing {business}." },
  ],
  nudge: [
    { name: "Professional", ...TPL_DEFAULTS.nudge },
    { name: "Friendly", subject: "Ready to pick a time, {customer}?", heading: "Let's find a time", message: "Hi {customer},\n\nWe noticed you accepted the quote for {service}. Awesome! The next step is picking a day and time that works for you.\n\nPrefer to talk it through? Call us at {phone}.\n\n{business}" },
    { name: "Short and simple", subject: "Pick a time for {service}", heading: "Choose your time", message: "Hi {customer}, your quote for {service} is accepted. Choose a time with the button below, or call {phone}." },
    { name: "Detailed", subject: "Next step: schedule your {service}", heading: "Schedule your visit", message: "Hi {customer},\n\nThank you for accepting our quote for {service}. We have not yet booked a date for the work.\n\nUse the button below to see our open times and reserve the one that suits you. Once you choose, you will receive a confirmation email with all the details. If none of the times work, call us at {phone} and we will find one that does.\n\n{business}" },
    { name: "Warm", subject: "We're ready when you are, {customer}", heading: "We're ready when you are", message: "Hi {customer},\n\nThank you again for choosing {business} for your {service}. Whenever you're ready, you can pick a time that fits your schedule, and we'll take it from there.\n\nIf you have any questions at all, call us at {phone}." },
  ],
};

export interface EmailLook { theme: "classic" | "modern" | "minimal" | "bold" | "soft"; header: string; accent: string }
export const THEME_LABEL: Record<EmailLook["theme"], string> = { classic: "Classic", modern: "Modern", minimal: "Minimal", bold: "Bold", soft: "Soft" };
export const LOOK_DEFAULT: EmailLook = { theme: "classic", header: "#0B2545", accent: "#EA580C" };

/** The business's saved look (style and colors), stored beside the wording under _style. */
export function getStyle(saved: unknown): EmailLook {
  const s = ((saved as Record<string, unknown> | null | undefined)?._style ?? {}) as Partial<EmailLook>;
  const ok = (v: unknown, d: string) => (typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v) ? v : d);
  return { theme: (s.theme && s.theme in THEME_LABEL ? s.theme : "classic") as EmailLook["theme"], header: ok(s.header, LOOK_DEFAULT.header), accent: ok(s.accent, LOOK_DEFAULT.accent) };
}

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
