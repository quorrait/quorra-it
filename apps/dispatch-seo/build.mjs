// Generates the Quorra Dispatch SEO pages into /dispatch plus /sitemap.xml and /robots.txt.
// Run from anywhere: node apps/dispatch-seo/build.mjs
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SITE, OUT_DIR, SIGNUP, BRAND, PRICING, TRADES, COMPETITORS, COMPETITOR_ANGLES, WHY } from "./data.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const tradePath = (t) => `/${OUT_DIR}/${t.slug}-software/`;
const compPath = (c) => `/${OUT_DIR}/${c.slug}/`;

const CSS = `
:root{--bg:#15140F;--ink:#F4F1EA;--ink2:#C9C3B7;--ink3:#8A847A;--rule:rgba(244,241,234,.14);--card:#1D1B16;--accent:#1CAADE;--sans:"Inter",-apple-system,BlinkMacSystemFont,"Helvetica Neue",Arial,sans-serif}
*{box-sizing:border-box}html,body{margin:0}body{font-family:var(--sans);background:var(--bg);color:var(--ink);font-size:16px;line-height:1.6;-webkit-font-smoothing:antialiased}
a{color:var(--accent);text-decoration:none}a:hover{text-decoration:underline}
.wrap{max-width:960px;margin:0 auto;padding:0 20px}
nav{border-bottom:1px solid var(--rule);padding:14px 0}nav .wrap{display:flex;justify-content:space-between;align-items:center;gap:12px}
nav .brand{color:var(--ink);font-weight:600}nav a.cta{background:var(--accent);color:#04202c;padding:8px 14px;border-radius:8px;font-weight:600}
nav a.cta:hover{text-decoration:none;opacity:.9}
h1{font-size:clamp(28px,5vw,44px);line-height:1.15;margin:48px 0 12px;letter-spacing:-.02em}
h2{font-size:24px;margin:48px 0 12px;letter-spacing:-.01em}h3{font-size:17px;margin:0 0 6px}
.lead{font-size:19px;color:var(--ink2);max-width:680px}
.btn{display:inline-block;background:var(--accent);color:#04202c;padding:13px 22px;border-radius:10px;font-weight:600;margin:20px 12px 0 0}
.btn:hover{text-decoration:none;opacity:.9}.btn.ghost{background:transparent;color:var(--ink);border:1px solid var(--rule)}
.note{color:var(--ink3);font-size:14px;margin-top:10px}
.grid{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(260px,1fr))}
.card{background:var(--card);border:1px solid var(--rule);border-radius:12px;padding:18px}.card p{margin:0;color:var(--ink2);font-size:15px}
.price{font-size:30px;font-weight:600}.price small{font-size:14px;color:var(--ink3);font-weight:400}
ul.tags{list-style:none;padding:0;display:flex;flex-wrap:wrap;gap:8px}ul.tags li{border:1px solid var(--rule);border-radius:999px;padding:5px 12px;font-size:14px;color:var(--ink2)}
details{border-bottom:1px solid var(--rule);padding:14px 0}summary{cursor:pointer;font-weight:600}details p{color:var(--ink2);margin:8px 0 0}
.links{display:flex;flex-wrap:wrap;gap:8px 18px;font-size:15px}
footer{border-top:1px solid var(--rule);margin-top:64px;padding:28px 0 48px;color:var(--ink3);font-size:14px}
.crumbs{font-size:14px;color:var(--ink3);margin-top:20px}
`;

function layout({ path, title, desc, body, jsonld = [] }) {
  const url = SITE + path;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${SITE}/logo_dark.png">
<link rel="icon" href="/favicon.ico?v=2">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<style>${CSS}</style>
${jsonld.map((j) => `<script type="application/ld+json">${JSON.stringify(j)}</script>`).join("\n")}
</head>
<body>
<nav><div class="wrap"><a class="brand" href="/${OUT_DIR}/">${BRAND}</a><a class="cta" href="${SIGNUP}">Start free trial</a></div></nav>
<main class="wrap">
${body}
</main>
<footer><div class="wrap">
<div class="links">${TRADES.map((t) => `<a href="${tradePath(t)}">${esc(t.name)} software</a>`).join("")}${COMPETITORS.map((c) => `<a href="${compPath(c)}">${esc(c.name)} alternative</a>`).join("")}</div>
<p>${BRAND} is a product of <a href="/">Quorra IT LLC</a>, Northern California. <a href="/privacy-policy.html">Privacy</a> · <a href="/terms.html">Terms</a></p>
</div></footer>
</body>
</html>
`;
}

const pricingBlock = () => `
<h2>Simple pricing</h2>
<div class="grid">${PRICING.map((p) => `<div class="card"><h3>${p.name}</h3><div class="price">${p.price}<small>/mo</small></div><p>${p.logins} · ${p.for}</p></div>`).join("")}</div>
<p class="note">Save 10% when you pay annually. Crews over 15 get a Custom plan. 14-day free trial.</p>`;

const ctaBlock = (label = "Start your 14-day free trial") => `<a class="btn" href="${SIGNUP}">${label}</a><a class="btn ghost" href="/${OUT_DIR}/">See all features</a>`;

const faqBlock = (faq) => `<h2>Frequently asked questions</h2>${faq.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join("")}`;

const appLd = (path, desc) => ({
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: BRAND,
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web, iOS, Android (installable web app)",
  url: SITE + path,
  description: desc,
  offers: PRICING.map((p) => ({ "@type": "Offer", name: p.name, price: p.price.replace("$", ""), priceCurrency: "USD" })),
});
const faqLd = (faq) => ({
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
});

const pages = [];

// Trade pages
for (const t of TRADES) {
  const path = tradePath(t);
  const others = TRADES.filter((x) => x.slug !== t.slug);
  const body = `
<p class="crumbs"><a href="/${OUT_DIR}/">${BRAND}</a> / ${esc(t.name)}</p>
<h1>${esc(t.hero)}</h1>
<p class="lead">${esc(t.sub)}</p>
${ctaBlock()}
<p class="note">Plans from $80/mo after your 14-day trial.</p>
<h2>Problems ${esc(t.noun)} run into, and how Dispatch handles them</h2>
<div class="grid">${t.pains.map(([h, p]) => `<div class="card"><h3>${esc(h)}</h3><p>${esc(p)}</p></div>`).join("")}</div>
<h2>Built around the jobs ${esc(t.noun)} actually do</h2>
<ul class="tags">${t.jobs.map((j) => `<li>${esc(j)}</li>`).join("")}</ul>
<h2>Why ${esc(t.noun)} pick ${BRAND}</h2>
<div class="grid">${WHY.map(([h, p]) => `<div class="card"><h3>${esc(h)}</h3><p>${esc(p)}</p></div>`).join("")}</div>
${pricingBlock()}
${faqBlock(t.faq)}
<h2>Ready to try it?</h2>${ctaBlock()}
<h2>Software for other trades</h2>
<div class="links">${others.map((o) => `<a href="${tradePath(o)}">${esc(o.name)}</a>`).join("")}</div>`;
  pages.push({ path, html: layout({ path, title: `${t.title} | ${BRAND}`, desc: t.desc, body, jsonld: [appLd(path, t.desc), faqLd(t.faq)] }) });
}

// Competitor pages
const compFaq = (c) => [
  [`How is ${BRAND} different from ${c.name}?`, `${BRAND} is priced by number of logins ($80, $190, or $300 a month) and is built for contractors and field crews. Check ${c.name}'s own site for its current plans and pricing so you can compare side by side.`],
  [`Can I move my customers over from ${c.name}?`, `Yes. CSV imports are supported, and the Enterprise plan includes data import help and an onboarding call.`],
  ["Is there a free trial?", "Yes. Every plan starts with a 14-day free trial."],
];
for (const c of COMPETITORS) {
  const path = compPath(c);
  const faq = compFaq(c);
  const desc = `Looking for a ${c.name} alternative? ${BRAND} offers scheduling, estimates, invoicing, and card payments from $80/mo with a 14-day free trial.`;
  const body = `
<p class="crumbs"><a href="/${OUT_DIR}/">${BRAND}</a> / ${esc(c.name)} alternative</p>
<h1>A ${esc(c.name)} alternative for small field service companies</h1>
<p class="lead">${esc(COMPETITOR_ANGLES[c.slug])}</p>
${ctaBlock()}
<h2>What you get with ${BRAND}</h2>
<div class="grid">${WHY.map(([h, p]) => `<div class="card"><h3>${esc(h)}</h3><p>${esc(p)}</p></div>`).join("")}</div>
<h2>What's included</h2>
<ul class="tags">${["Job scheduling and calendar", "Estimates and invoices", "Card payments on the spot", "Customer portal", "Online booking", "Text and email reminders", "Lead form and pipeline", "Recurring service plans", "Timesheets", "Purchase orders", "QuickBooks Online sync (Enterprise)", "Reports and labor costs (Enterprise)"].map((x) => `<li>${x}</li>`).join("")}</ul>
${pricingBlock()}
<p class="note">${esc(c.name)} is a trademark of its owner and is not affiliated with Quorra IT. Compare current plans on ${esc(c.name)}'s own website before deciding.</p>
${faqBlock(faq)}
<h2>Try it with your own jobs</h2>${ctaBlock()}
<h2>Software by trade</h2>
<div class="links">${TRADES.map((o) => `<a href="${tradePath(o)}">${esc(o.name)}</a>`).join("")}</div>`;
  pages.push({ path, html: layout({ path, title: `${c.name} Alternative for Contractors | ${BRAND}`, desc, body, jsonld: [appLd(path, desc), faqLd(faq)] }) });
}

// Hub page
{
  const path = `/${OUT_DIR}/`;
  const desc = `${BRAND}: scheduling, estimates, invoicing, and card payments for plumbers, HVAC, electricians, roofers, and contractors. 14-day free trial, from $80/mo.`;
  const body = `
<h1>Field service software for contractors</h1>
<p class="lead">${BRAND} handles scheduling, estimates, invoices, customer payments, and your crew's time, all from your phone. Plans start at $80/mo with a 14-day free trial.</p>
${ctaBlock()}
<h2>Software for your trade</h2>
<div class="grid">${TRADES.map((t) => `<a class="card" href="${tradePath(t)}"><h3>${esc(t.name)}</h3><p>${esc(t.sub)}</p></a>`).join("")}</div>
<h2>Why ${BRAND}</h2>
<div class="grid">${WHY.map(([h, p]) => `<div class="card"><h3>${esc(h)}</h3><p>${esc(p)}</p></div>`).join("")}</div>
${pricingBlock()}
<h2>Comparing options?</h2>
<div class="links">${COMPETITORS.map((c) => `<a href="${compPath(c)}">${esc(c.name)} alternative</a>`).join("")}</div>
<h2>Start today</h2>${ctaBlock()}`;
  pages.push({ path, html: layout({ path, title: `${BRAND}: Field Service Software for Contractors`, desc, body, jsonld: [appLd(path, desc)] }) });
}

// Write
rmSync(join(ROOT, OUT_DIR), { recursive: true, force: true });
for (const p of pages) {
  const file = join(ROOT, p.path, "index.html");
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, p.html);
}
const today = new Date().toISOString().slice(0, 10);
const urls = [{ path: "/" }, ...pages].map((p) => `  <url><loc>${SITE}${p.path}</loc><lastmod>${today}</lastmod></url>`).join("\n");
writeFileSync(join(ROOT, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
writeFileSync(join(ROOT, "robots.txt"), `User-agent: *\nAllow: /\nDisallow: /field-test/\n\nSitemap: ${SITE}/sitemap.xml\n`);
console.log(`Wrote ${pages.length} pages, sitemap.xml, robots.txt`);
