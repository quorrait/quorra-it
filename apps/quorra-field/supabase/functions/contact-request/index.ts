// Public: the "Contact us" form on the plans page. Saves the request and emails it to you. Deploy with --no-verify-jwt.
import { admin, handler, HttpError, json } from "../_shared/util.ts";
import { sendEmail } from "../_shared/notify.ts";

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
    text: `Name: ${r.name}\nCompany: ${r.company}\nEmail: ${r.email}\nPhone: ${r.phone}\nBest way to reach: ${r.best_way}\n\nHow can we help?\n${r.message}` });
  return json({ ok: true });
});
