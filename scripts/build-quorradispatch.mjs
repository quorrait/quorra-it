// Builds the static site for quorradispatch.com into dist-quorradispatch/.
// / is the Dispatch landing page, /privacy/ is the privacy page,
// /app/ is the production web app (what /field is today), and
// /test/ is a second copy of the same app (what /field-test is today).
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appDir = join(root, "apps/quorra-field");
const out = join(root, "dist-quorradispatch");

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const tsc = spawnSync("npx", ["tsc", "--noEmit"], { cwd: appDir, stdio: "inherit", env: process.env });
if (tsc.status) process.exit(tsc.status ?? 1);

function vite(base, dir) {
  const result = spawnSync("npx", ["vite", "build", "--outDir", dir, "--emptyOutDir"], {
    cwd: appDir,
    stdio: "inherit",
    env: { ...process.env, VITE_BASE: base },
  });
  if (result.status) process.exit(result.status ?? 1);
}

vite("/app/", join(out, "app"));
vite("/test/", join(out, "test"));
// Vite copies public/_headers into each app. Pages ignores it under /app and would
// serve the file at /app/_headers. The worker sets the headers instead.
rmSync(join(out, "app/_headers"), { force: true });
rmSync(join(out, "test/_headers"), { force: true });

// Pages live in this repo under dispatch/<slug>/ and are published at quorradispatch.com/<slug>/.
function rewriteMarketing(html) {
  return html
    .replaceAll("https://www.quorrait.com/dispatch/", "https://quorradispatch.com/")
    .replaceAll('href="/field-test/#/login"', 'href="/app/"')
    .replaceAll('href="/field-test/#/start?plan=', 'href="/app/plans?plan=')
    .replaceAll('"/field-test/#/start?plan="', '"/app/plans?plan="')
    .replaceAll("https://quorradispatch.com/app/start", "https://quorradispatch.com/app/plans")
    .replaceAll('src="/field/', 'src="/')
    .replaceAll('href="/field/', 'href="/')
    .replace(/href="\/dispatch\//g, "href=\"/")
    .replaceAll('href="/terms.html"', 'href="https://www.quorrait.com/terms.html"')
    .replaceAll('href="/privacy-policy.html"', 'href="/privacy/"')
    .replace(
      '<span>Quorra Dispatch by <a href="/">Quorra IT</a></span>',
      '<span>Quorra Dispatch by <a href="https://www.quorrait.com/">Quorra IT</a></span>',
    )
    .replaceAll('<a href="/">Quorra IT LLC</a>', '<a href="https://www.quorrait.com/">Quorra IT LLC</a>');
}

writeFileSync(join(out, "index.html"), rewriteMarketing(readFileSync(join(root, "dispatch/index.html"), "utf8")));

const slugs = [];
for (const name of readdirSync(join(root, "dispatch"))) {
  const dir = join(root, "dispatch", name);
  if (!statSync(dir).isDirectory()) continue;
  const page = join(dir, "index.html");
  if (!existsSync(page)) continue;
  mkdirSync(join(out, name), { recursive: true });
  writeFileSync(join(out, name, "index.html"), rewriteMarketing(readFileSync(page, "utf8")));
  slugs.push(name);
}

// lastmod is the date the page content last changed, not the build date.
// 2026-11-12: homepage structured data, /about/, the three comparison pages, and the privacy canonical.
// Other marketing URLs keep 2026-11-11.
const CONTENT_LASTMOD = {
  "https://quorradispatch.com/": "2026-11-12",
  "https://quorradispatch.com/about/": "2026-11-12",
  "https://quorradispatch.com/jobber-alternative/": "2026-11-12",
  "https://quorradispatch.com/housecall-pro-alternative/": "2026-11-12",
  "https://quorradispatch.com/servicetitan-alternative/": "2026-11-12",
  "https://quorradispatch.com/privacy/": "2026-11-12",
};
const PRIOR_LASTMOD = "2026-11-11";
const locs = ["https://quorradispatch.com/", ...slugs.sort().map((slug) => `https://quorradispatch.com/${slug}/`)];
writeFileSync(join(out, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${locs.map((loc) => `  <url><loc>${loc}</loc><lastmod>${CONTENT_LASTMOD[loc] || PRIOR_LASTMOD}</lastmod></url>`).join("\n")}\n</urlset>\n`);
writeFileSync(join(out, "robots.txt"), "User-agent: *\nAllow: /\nDisallow: /test/\n\nSitemap: https://quorradispatch.com/sitemap.xml\n");

for (const file of ["reel.mp4", "reel.webm", "reel-poster.jpg", "og.png"]) {
  cpSync(join(root, "dispatch", file), join(out, file));
}
cpSync(join(root, "dispatch/media"), join(out, "media"), { recursive: true });
for (const file of ["favicon-32.png", "apple-touch-icon.png", "logo-mark-v2.png", "favicon.ico"]) {
  cpSync(join(appDir, "public", file), join(out, file));
}
// Square mark for Organization.logo. icon-512.png is the existing 512×512 Dispatch icon.
cpSync(join(appDir, "public", "icon-512.png"), join(out, "logo.png"));

// Pages rejects "/app/* /app/index.html 200" as an infinite loop, then (with no
// root 404.html) serves the landing page for every path that is not a file.
// A root 404.html turns that off. Copies of each app's index at app/404.html
// and test/404.html are what a missing deep link renders. _worker.js returns
// those with status 200 so the address bar stays on /app/jobs.
cpSync(join(out, "app/index.html"), join(out, "app/404.html"));
cpSync(join(out, "test/index.html"), join(out, "test/404.html"));
cpSync(join(root, "scripts/quorradispatch-404.html"), join(out, "404.html"));
cpSync(join(root, "scripts/quorradispatch-worker.js"), join(out, "_worker.js"));

// Pages does not apply _headers to responses from _worker.js. The worker sets the same noindex.
writeFileSync(join(out, "_headers"), [
  "# Keep the pages.dev host and the thin /app shell out of search.",
  "# /test/ stays Disallow in robots.txt and is not marked noindex here.",
  "https://:project.pages.dev/*",
  "  X-Robots-Tag: noindex",
  "",
  "https://:version.:project.pages.dev/*",
  "  X-Robots-Tag: noindex",
  "",
  "/app/*",
  "  X-Robots-Tag: noindex",
  "",
].join("\n"));

writeFileSync(join(out, "_redirects"), [
  "# Exact paths before splats. SPA deep links are _worker.js, not a 200 rewrite:",
  "# Pages drops \"/app/* /app/index.html 200\" and would serve the landing page.",
  "/field-test     /test/         301",
  "/field          /app/          301",
  "/dispatch/privacy/  /privacy/  301",
  "/dispatch/privacy   /privacy/  301",
  "/dispatch/      /              301",
  "/dispatch       /              301",
  "/dispatch/*     /:splat        301",
  "/app            /app/          301",
  "/test           /test/         301",
  "/privacy        /privacy/      301",
  "/about          /about/        301",
  "/field-test/*   /test/:splat   301",
  "/field/*        /app/:splat    301",
  "",
].join("\n"));

console.log(`Built ${out}`);
