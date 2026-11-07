// Sending email and text messages. Both need an account with a provider; until the secrets are set they do nothing and report why.
//   Email: Resend (resend.com)       secrets: RESEND_API_KEY, FROM_EMAIL (an address on a domain you verified in Resend)
//   Text:  Twilio (twilio.com)       secrets: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM (your Twilio number, +1...)

export interface SendResult { sent: boolean; reason?: string }

export async function sendEmail(o: { to: string; subject: string; text: string; html?: string; replyTo?: string }): Promise<SendResult> {
  const key = Deno.env.get("RESEND_API_KEY"), from = Deno.env.get("FROM_EMAIL");
  if (!key || !from) return { sent: false, reason: "Email is not set up (RESEND_API_KEY / FROM_EMAIL)" };
  if (!o.to) return { sent: false, reason: "No email address" };
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [o.to], subject: o.subject, text: o.text, html: o.html, reply_to: o.replyTo }),
  });
  if (!r.ok) return { sent: false, reason: `Email provider said: ${(await r.text()).slice(0, 200)}` };
  return { sent: true };
}

const e164 = (p: string) => { const d = p.replace(/\D/g, ""); return d.length === 10 ? `+1${d}` : d.length === 11 && d.startsWith("1") ? `+${d}` : p.startsWith("+") ? p : ""; };

export async function sendSms(o: { to: string; body: string }): Promise<SendResult> {
  const sid = Deno.env.get("TWILIO_ACCOUNT_SID"), tok = Deno.env.get("TWILIO_AUTH_TOKEN"), from = Deno.env.get("TWILIO_FROM");
  if (!sid || !tok || !from) return { sent: false, reason: "Text messaging is not set up (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM)" };
  const to = e164(o.to ?? "");
  if (!to) return { sent: false, reason: "No valid phone number" };
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: { Authorization: "Basic " + btoa(`${sid}:${tok}`), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ To: to, From: from, Body: o.body }),
  });
  if (!r.ok) return { sent: false, reason: `Text provider said: ${(await r.text()).slice(0, 200)}` };
  return { sent: true };
}
