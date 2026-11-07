/**
 * Ready-made website lead forms. Each is plain HTML using the field names Quorra Dispatch understands
 * (name, phone, email, address, service, message). Any other field, such as urgency or property, is added to
 * the lead's notes. {{accent}} follows the Accent color chosen in the form settings and {{business_name}} is
 * the company name, both filled in when the form is shown. Heading, intro and button text come from the form settings.
 */
export interface FormTemplateChoice { id: string; name: string; desc: string; html: string }

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

export interface FormWording { accent?: string; heading?: string; intro?: string; button?: string; services?: string[] }
export const DEFAULT_SERVICE_OPTIONS = `<option value="">Choose one</option><option>Repair</option><option>Installation or replacement</option><option>Maintenance or tune-up</option><option>Inspection or estimate</option><option>Something else</option>`;

/**
 * Fills the placeholders. {{heading|Fallback}}, {{intro|Fallback}} and {{button|Fallback}} show the wording typed in
 * the form settings, or the fallback when it is empty; {{service_options}} becomes the service choices.
 * The live form page (lead.html) does the same thing.
 */
export function fillFormTemplate(html: string, businessName?: string, w: FormWording = {}): string {
  const a = /^#[0-9a-f]{6}$/i.test(w.accent ?? "") ? (w.accent as string) : "#ea580c";
  const services = (w.services ?? []).map((x) => x.trim()).filter(Boolean);
  const opts = services.length ? `<option value="">Choose one</option>${services.map((x) => `<option>${esc(x)}</option>`).join("")}` : DEFAULT_SERVICE_OPTIONS;
  return html
    .replace(/\{\{\s*accent\s*\}\}/gi, a)
    .replace(/\{\{\s*business_name\s*\}\}/gi, esc(businessName || "Our team"))
    .replace(/\{\{\s*service_options\s*\}\}/gi, opts)
    .replace(/\{\{\s*(heading|intro|button)\s*(?:\|([^}]*))?\}\}/gi, (_m, k: string, fb?: string) => ((w[k.toLowerCase() as "heading" | "intro" | "button"] ?? "").trim() ? esc((w[k.toLowerCase() as "heading" | "intro" | "button"] as string).trim()) : (fb ?? "").trim()));
}

const HP = `<div style="position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden" aria-hidden="true"><label>Leave blank<input name="hp" tabindex="-1" autocomplete="off"></label></div>`;

const CLEAN = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
*{box-sizing:border-box}
body{margin:0;padding:12px;font:16px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;color:#0f172a;background:transparent}
.card{max-width:560px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-top:5px solid {{accent}};border-radius:14px;padding:22px;box-shadow:0 6px 22px rgba(15,23,42,.08)}
.biz{font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:{{accent}};margin:0 0 4px}
h1{margin:0 0 4px;font-size:24px;letter-spacing:-.01em}.sub{margin:0 0 18px;color:#64748b;font-size:15px}
label{display:block;font-weight:600;font-size:14px;margin:0 0 14px}
input,select,textarea{display:block;width:100%;margin-top:5px;padding:12px;font:inherit;font-weight:400;border:1px solid #cbd5e1;border-radius:10px;background:#f8fafc;color:#0f172a}
input:focus,select:focus,textarea:focus{outline:none;border-color:{{accent}};background:#fff;box-shadow:0 0 0 3px rgba(100,116,139,.18)}
textarea{min-height:96px;resize:vertical}
.row{display:grid;grid-template-columns:1fr 1fr;gap:0 14px}@media(max-width:480px){.row{grid-template-columns:1fr}}
button{width:100%;padding:14px;border:0;border-radius:10px;background:{{accent}};color:#fff;font:inherit;font-size:17px;font-weight:700;cursor:pointer}
.fine{margin:10px 0 0;text-align:center;font-size:12px;color:#94a3b8}
</style></head>
<body><div class="card">
<p class="biz">{{business_name}}</p>
<h1>{{heading|Request service}}</h1><p class="sub">{{intro|Tell us what you need and we will get back to you shortly.}}</p>
<form>
  <div class="row">
    <label>Full name *<input name="name" autocomplete="name" required placeholder="Jane Smith"></label>
    <label>Phone<input name="phone" type="tel" autocomplete="tel" placeholder="(555) 123-4567"></label>
  </div>
  <label>Email<input name="email" type="email" autocomplete="email" placeholder="you@example.com"></label>
  <label>Service address<input name="address" autocomplete="street-address" placeholder="Street, city"></label>
  <label>What do you need?<select name="service">{{service_options}}</select></label>
  <label>Details<textarea name="message" placeholder="Anything that will help us prepare"></textarea></label>
  ${HP}
  <button type="submit">{{button|Request service}}</button>
  <p class="fine">Please give a phone number or email so we can reach you.</p>
</form>
</div></body></html>
`;

const DARK = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
*{box-sizing:border-box}
body{margin:0;padding:12px;font:16px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;background:transparent}
.card{max-width:580px;margin:0 auto;background:linear-gradient(160deg,#0b1626,#13263f);color:#e5edf7;border-radius:18px;padding:26px;border:1px solid #223a5c}
.biz{display:inline-block;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#fff;background:{{accent}};padding:4px 10px;border-radius:99px;margin-bottom:12px}
h1{margin:0 0 6px;font-size:26px;color:#fff;letter-spacing:-.01em}.sub{margin:0 0 20px;color:#9fb3cc;font-size:15px}
label{display:block;font-weight:600;font-size:13px;color:#c5d3e5;margin:0 0 14px}
input,select,textarea{display:block;width:100%;margin-top:6px;padding:12px;font:inherit;font-weight:400;border:1px solid #2d4668;border-radius:10px;background:#0e1d31;color:#fff}
input::placeholder,textarea::placeholder{color:#6b82a1}
input:focus,select:focus,textarea:focus{outline:none;border-color:{{accent}};box-shadow:0 0 0 3px rgba(255,255,255,.1)}
textarea{min-height:96px;resize:vertical}
.row{display:grid;grid-template-columns:1fr 1fr;gap:0 14px}@media(max-width:480px){.row{grid-template-columns:1fr}}
button{width:100%;padding:14px;border:0;border-radius:10px;background:{{accent}};color:#fff;font:inherit;font-size:17px;font-weight:700;cursor:pointer;margin-top:4px}
</style></head>
<body><div class="card">
<span class="biz">{{business_name}}</span>
<h1>{{heading|Book a service call}}</h1><p class="sub">{{intro|Send us the details and a technician will contact you to confirm a time.}}</p>
<form>
  <div class="row">
    <label>Full name *<input name="name" autocomplete="name" required></label>
    <label>Phone<input name="phone" type="tel" autocomplete="tel"></label>
  </div>
  <div class="row">
    <label>Email<input name="email" type="email" autocomplete="email"></label>
    <label>Service address<input name="address" autocomplete="street-address"></label>
  </div>
  <label>Type of service<select name="service">{{service_options}}</select></label>
  <label>What is going on?<textarea name="message" placeholder="Describe the problem or the work you want done"></textarea></label>
  ${HP}
  <button type="submit">{{button|Request a call back}}</button>
</form>
</div></body></html>
`;

const QUICK = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
*{box-sizing:border-box}
body{margin:0;padding:12px;font:16px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;color:#111827;background:transparent}
.card{max-width:440px;margin:0 auto;background:#fff;border-radius:20px;padding:24px;box-shadow:0 10px 34px rgba(17,24,39,.14);text-align:center}
h1{margin:0 0 4px;font-size:25px;letter-spacing:-.02em}
.sub{margin:0 0 18px;color:#6b7280;font-size:14.5px}.sub b{color:{{accent}}}
form{text-align:left}
input,textarea{display:block;width:100%;margin:0 0 12px;padding:14px 16px;font:inherit;border:2px solid #e5e7eb;border-radius:14px;background:#fff;color:#111827}
input:focus,textarea:focus{outline:none;border-color:{{accent}}}
textarea{min-height:84px;resize:vertical}
button{width:100%;padding:16px;border:0;border-radius:99px;background:{{accent}};color:#fff;font:inherit;font-size:18px;font-weight:800;cursor:pointer}
.fine{margin:12px 0 0;text-align:center;font-size:12px;color:#9ca3af}
</style></head>
<body><div class="card">
<h1>{{heading|Get a fast quote}}</h1>
<p class="sub">{{intro|{{business_name}} replies quickly. Just three things:}}</p>
<form>
  <input name="name" autocomplete="name" required placeholder="Your name">
  <input name="phone" type="tel" autocomplete="tel" required placeholder="Best phone number">
  <textarea name="message" placeholder="What do you need done?"></textarea>
  ${HP}
  <button type="submit">{{button|Get my quote}}</button>
  <p class="fine">No spam. We only use this to contact you about your request.</p>
</form>
</div></body></html>
`;

const URGENT = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
*{box-sizing:border-box}
body{margin:0;padding:12px;font:16px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;color:#111827;background:transparent}
.card{max-width:560px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden;box-shadow:0 6px 22px rgba(17,24,39,.1)}
.alert{background:#dc2626;color:#fff;padding:14px 22px;font-weight:700}.alert small{display:block;font-weight:400;opacity:.92;margin-top:2px}
form{padding:20px 22px 22px}
h1{margin:0 0 14px;font-size:22px}
label.f{display:block;font-weight:600;font-size:14px;margin:0 0 14px}
input[type=text],input[type=tel],input[type=email],textarea{display:block;width:100%;margin-top:5px;padding:12px;font:inherit;font-weight:400;border:1px solid #d1d5db;border-radius:10px;background:#f9fafb;color:#111827}
input:focus,textarea:focus{outline:none;border-color:{{accent}};background:#fff}
textarea{min-height:84px;resize:vertical}
.q{font-weight:600;font-size:14px;margin:0 0 8px}
.opts{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px}
.opts label{margin:0}.opts input{position:absolute;opacity:0;pointer-events:none}
.opts span{display:block;text-align:center;padding:11px 8px;border:2px solid #e5e7eb;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;background:#fff}
.opts input:checked+span{border-color:{{accent}};background:{{accent}};color:#fff}
.opts input:focus-visible+span{outline:2px solid #111827;outline-offset:2px}
button{width:100%;padding:15px;border:0;border-radius:10px;background:{{accent}};color:#fff;font:inherit;font-size:17px;font-weight:800;cursor:pointer}
</style></head>
<body><div class="card">
<div class="alert">Need help right now?<small>Choose "Emergency" below and {{business_name}} will prioritize your request.</small></div>
<form>
  <h1>{{heading|Request urgent service}}</h1>
  <label class="f">Your name *<input type="text" name="name" autocomplete="name" required></label>
  <label class="f">Phone number *<input type="tel" name="phone" autocomplete="tel" required placeholder="So we can call you back"></label>
  <label class="f">Where is the problem?<input type="text" name="address" autocomplete="street-address" placeholder="Street address"></label>
  <p class="q">How urgent is it?</p>
  <div class="opts">
    <label><input type="radio" name="urgency" value="EMERGENCY - right now"><span>Emergency</span></label>
    <label><input type="radio" name="urgency" value="Today"><span>Today</span></label>
    <label><input type="radio" name="urgency" value="This week"><span>This week</span></label>
    <label><input type="radio" name="urgency" value="Just planning ahead"><span>Planning ahead</span></label>
  </div>
  <label class="f">What happened?<textarea name="message" placeholder="Briefly describe the problem"></textarea></label>
  ${HP}
  <button type="submit">{{button|Send urgent request}}</button>
</form>
</div></body></html>
`;

const STEPS = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
*{box-sizing:border-box}
body{margin:0;padding:12px;font:16px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;color:#1f2937;background:transparent}
.card{max-width:620px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:16px;padding:24px;box-shadow:0 6px 22px rgba(31,41,55,.08)}
h1{margin:0 0 4px;font-size:25px;letter-spacing:-.01em}.sub{margin:0 0 6px;color:#6b7280;font-size:15px}
.sec{display:flex;gap:10px;align-items:center;margin:22px 0 12px;font-weight:800;font-size:15px}
.sec i{flex:none;width:26px;height:26px;border-radius:50%;background:{{accent}};color:#fff;font-style:normal;display:grid;place-items:center;font-size:13px}
.sec::after{content:"";flex:1;height:1px;background:#e5e7eb}
label{display:block;font-weight:600;font-size:14px;margin:0 0 12px}
input,select,textarea{display:block;width:100%;margin-top:5px;padding:12px;font:inherit;font-weight:400;border:1px solid #d1d5db;border-radius:10px;background:#fff;color:#1f2937}
input:focus,select:focus,textarea:focus{outline:none;border-color:{{accent}};box-shadow:0 0 0 3px rgba(107,114,128,.2)}
textarea{min-height:96px;resize:vertical}
.row{display:grid;grid-template-columns:1fr 1fr;gap:0 14px}@media(max-width:480px){.row{grid-template-columns:1fr}}
button{width:100%;margin-top:10px;padding:15px;border:0;border-radius:10px;background:{{accent}};color:#fff;font:inherit;font-size:17px;font-weight:700;cursor:pointer}
.fine{margin:10px 0 0;text-align:center;font-size:12px;color:#9ca3af}
</style></head>
<body><div class="card">
<h1>{{heading|Request a free estimate}}</h1>
<p class="sub">{{intro|Answer a few quick questions and {{business_name}} will follow up with a price.}}</p>
<form>
  <div class="sec"><i>1</i>About you</div>
  <div class="row">
    <label>Full name *<input name="name" autocomplete="name" required></label>
    <label>Phone<input name="phone" type="tel" autocomplete="tel"></label>
  </div>
  <label>Email<input name="email" type="email" autocomplete="email"></label>
  <div class="sec"><i>2</i>Your property</div>
  <label>Address<input name="address" autocomplete="street-address" placeholder="Street, city"></label>
  <label>Property type<select name="property"><option value="">Choose one</option><option>House</option><option>Townhome or condo</option><option>Apartment</option><option>Commercial building</option></select></label>
  <div class="sec"><i>3</i>The work</div>
  <div class="row">
    <label>Type of work<select name="service">{{service_options}}</select></label>
    <label>When do you need it?<select name="timeline"><option value="">Choose one</option><option>As soon as possible</option><option>Within 2 weeks</option><option>Within a month</option><option>Just getting prices</option></select></label>
  </div>
  <label>Tell us more<textarea name="message" placeholder="Size of the job, what you have now, anything we should know"></textarea></label>
  ${HP}
  <button type="submit">{{button|Request my free estimate}}</button>
  <p class="fine">We will reach out by phone or email, usually within one business day.</p>
</form>
</div></body></html>
`;

export const LEAD_FORM_TEMPLATES: FormTemplateChoice[] = [
  { id: "clean", name: "Clean card", desc: "Simple white card, all the basics", html: CLEAN },
  { id: "dark", name: "Dark pro", desc: "Dark navy, two-column, looks premium", html: DARK },
  { id: "quick", name: "Quick quote", desc: "Just name, phone and what you need", html: QUICK },
  { id: "urgent", name: "Emergency", desc: "Red alert bar and an urgency picker", html: URGENT },
  { id: "steps", name: "Free estimate", desc: "Three short steps with property details", html: STEPS },
];
