// Public: the "Contact us" form on the plans page. Saves the request and emails it to you. Deploy with --no-verify-jwt.
import { admin, handler, HttpError, json } from "../_shared/util.ts";
import { sendEmail } from "../_shared/notify.ts";
import { emailHtml } from "../_shared/emailTemplate.ts";

const clean = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);

handler(async (req) => {
  if (req.method !== "POST") throw new HttpError(405, "POST only");
  const b = await req.json().catch(() => ({}));
  if (clean(b.hp, 50)) return json({ ok: true }); // honeypot: bots fill this in
  const r = { name: clean(b.name, 120), company: clean(b.company, 160), email: clean(b.email, 200), phone: clean(b.phone, 40), best_way: clean(b.best_way, 20), message: clean(b.message, 4000) };
  if (!r.name) throw new HttpError(400, "Please enter your name.");
  if (!/^\S+@\S+\.\S+$/.test(r.email) && r.phone.replace(/\D/g, "").length < 10) throw new HttpError(400, "Please enter an email or a phone number so we can reach you.");
  if (!r.message) throw new HttpError(400, "Please tell us how we can help.");
  const { error } = await admin().from("contact_requests").insert(r);
  if (error) throw new HttpError(500, "Could not save your request. Please try again.");
  const to = Deno.env.get("CONTACT_TO") ?? "quorrait@gmail.com";
  await sendEmail({ to, replyTo: r.email || undefined, subject: `Quorra Dispatch contact: ${r.name}${r.company ? ` (${r.company})` : ""}`,
    text: `Name: ${r.name}\nCompany: ${r.company}\nEmail: ${r.email}\nPhone: ${r.phone}\nBest way to reach: ${r.best_way}\n\nHow can we help?\n${r.message}`,
    html: emailHtml({
      heading: "New contact request", preheader: `${r.name} wants to talk about Quorra Dispatch.`,
      rows: [{ label: "Name", value: r.name }, ...(r.company ? [{ label: "Company", value: r.company }] : []), ...(r.email ? [{ label: "Email", value: r.email }] : []), ...(r.phone ? [{ label: "Phone", value: r.phone }] : []), ...(r.best_way ? [{ label: "Best way to reach", value: r.best_way }] : [])],
      paragraphs: [r.message],
      button: r.email ? { label: `Reply to ${r.name.split(" ")[0]}`, url: `mailto:${r.email}` } : r.phone ? { label: `Call ${r.name.split(" ")[0]}`, url: `tel:${r.phone}` } : undefined,
    }) });
  if (r.email) await sendEmail({ to: r.email, subject: "We got your message", text: `Hi ${r.name.split(" ")[0]}, thanks for contacting Quorra Dispatch. We reply within 1-2 business days.`,
    html: emailHtml({ heading: "We got your message", paragraphs: [`Hi ${r.name.split(" ")[0]}, thanks for reaching out about Quorra Dispatch.`, "We reply within 1-2 business days, usually sooner."], fine: "Need us sooner? Reply to this email." }) });
  return json({ ok: true });
});
