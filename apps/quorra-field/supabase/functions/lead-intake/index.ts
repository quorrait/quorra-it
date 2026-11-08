// Public endpoint behind the website lead form. Deploy with --no-verify-jwt.
// A business is identified by its public lead_key (not secret, but unguessable) and the caller can only ever add a "new" lead.
import { admin, handler, HttpError, json } from "../_shared/util.ts";
import { notifyAccount } from "../_shared/alert.ts";

const clip = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

handler(async (req) => {
  if (req.method !== "POST") throw new HttpError(405, "POST only");
  const b = await req.json().catch(() => null);
  if (!b || typeof b !== "object") throw new HttpError(400, "Invalid request");

  // Honeypot: real visitors never fill this hidden field. Pretend success so bots don't retry.
  if (clip(b.hp, 50)) return json({ ok: true });

  const key = clip(b.k, 64);
  const name = clip(b.name, 120);
  const phone = clip(b.phone, 40);
  const email = clip(b.email, 160);
  if (!key) throw new HttpError(400, "Missing form key");
  if (!name) throw new HttpError(400, "Please enter your name");
  if (!phone && !email) throw new HttpError(400, "Please enter a phone number or email");
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(400, "Please enter a valid email address");

  const db = admin();
  const { data: biz } = await db.from("business").select("owner_id").eq("lead_key", key).maybeSingle();
  if (!biz) throw new HttpError(404, "This form is not active");

  // Basic flood control: at most 30 web leads per business per hour.
  const since = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await db.from("leads").select("id", { count: "exact", head: true })
    .eq("owner_id", biz.owner_id).eq("source", "Website form").gte("created_at", since);
  if ((count ?? 0) >= 30) throw new HttpError(429, "Too many requests. Please call us instead.");

  // A blacklisted customer can submit the form, but it lands as declined and the owner is told why.
  const digits = phone.replace(/\D/g, "").slice(-10);
  const { data: flagged } = await db.from("customers").select("name,phone,email,flag_note").eq("owner_id", biz.owner_id).eq("flag", "blocked");
  const hit = (flagged ?? []).find((c) => (digits.length >= 7 && String(c.phone ?? "").replace(/\D/g, "").slice(-10) === digits) || (email && String(c.email ?? "").toLowerCase() === email.toLowerCase()));
  if (hit) {
    await db.from("leads").insert({
      owner_id: biz.owner_id, name, phone, email, address: clip(b.address, 200), service: clip(b.service, 200),
      notes: `BLACKLISTED customer (${hit.name}): ${hit.flag_note ?? ""}\n${clip(b.message, 2000)}`.trim(),
      source: "Website form", stage: "declined", value_cents: 0,
    });
    await notifyAccount(db, biz.owner_id, { title: `Blacklisted customer sent a request: ${name}`, body: `${hit.name} is marked do not serve. The request was saved as declined.`, link: "/leads" });
    return json({ ok: true });
  }

  const { error } = await db.from("leads").insert({
    owner_id: biz.owner_id, name, phone, email,
    address: clip(b.address, 200), service: clip(b.service, 200), notes: clip(b.message, 2000),
    source: "Website form", stage: "new", value_cents: 0,
  });
  if (error) throw error;
  return json({ ok: true });
});
