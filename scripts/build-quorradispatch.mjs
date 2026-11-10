// Builds the static site for quorradispatch.com into dist-quorradispatch/.
// / is the Dispatch landing page, /privacy/ is the privacy page,
// /app/ is the production web app (what /field is today), and
// /test/ is a second copy of the same app (what /field-test is today).
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

let landing = readFileSync(join(root, "dispatch/index.html"), "utf8");
landing = landing
  .replaceAll("https://www.quorrait.com/dispatch/", "https://quorradispatch.com/")
  .replaceAll('href="/field-test/#/login"', 'href="/app/"')
  .replaceAll('href="/field-test/#/start?plan=', 'href="/app/start?plan=')
  .replaceAll('"/field-test/#/start?plan="', '"/app/start?plan="')
  .replaceAll('href="/field/?demo=1"', 'href="/app/?demo=1"')
  .replaceAll('src="/field/', 'src="/')
  .replaceAll('href="/field/', 'href="/')
  .replaceAll('href="/dispatch/privacy/"', 'href="/privacy/"')
  .replaceAll('href="/dispatch/"', 'href="/"')
  .replaceAll('href="/terms.html"', 'href="https://www.quorrait.com/terms.html"')
  .replaceAll('href="/privacy-policy.html"', 'href="https://www.quorrait.com/privacy-policy.html"')
  .replace(
    '<span>Quorra Dispatch by <a href="/">Quorra IT</a></span>',
    '<span>Quorra Dispatch by <a href="https://www.quorrait.com/">Quorra IT</a></span>',
  )
  .replaceAll('href="/dispatch/', 'href="https://www.quorrait.com/dispatch/');
writeFileSync(join(out, "index.html"), landing);

let privacy = readFileSync(join(root, "dispatch/privacy/index.html"), "utf8");
privacy = privacy
  .replaceAll("https://www.quorrait.com/dispatch/privacy", "https://quorradispatch.com/privacy")
  .replaceAll("https://www.quorrait.com/dispatch", "https://quorradispatch.com")
  .replaceAll('href="/field/', 'href="/')
  .replaceAll('href="/dispatch/privacy/"', 'href="/privacy/"')
  .replaceAll('href="/dispatch/"', 'href="/"')
  .replaceAll('href="/privacy-policy.html"', 'href="https://www.quorrait.com/privacy-policy.html"')
  .replaceAll('href="/terms.html"', 'href="https://www.quorrait.com/terms.html"')
  .replace('<a href="/">Quorra IT LLC</a>', '<a href="https://www.quorrait.com/">Quorra IT LLC</a>');
mkdirSync(join(out, "privacy"), { recursive: true });
writeFileSync(join(out, "privacy/index.html"), privacy);

for (const file of ["reel.mp4", "reel.webm", "reel-poster.jpg"]) {
  cpSync(join(root, "dispatch", file), join(out, file));
}
for (const file of ["favicon-32.png", "apple-touch-icon.png", "logo-mark-v2.png", "favicon.ico"]) {
  cpSync(join(appDir, "public", file), join(out, file));
}

// Pages rejects "/app/* /app/index.html 200" as an infinite loop, then (with no
// root 404.html) serves the landing page for every path that is not a file.
// A root 404.html turns that off. Copies of each app's index at app/404.html
// and test/404.html are what a missing deep link renders. _worker.js returns
// those with status 200 so the address bar stays on /app/jobs.
cpSync(join(out, "app/index.html"), join(out, "app/404.html"));
cpSync(join(out, "test/index.html"), join(out, "test/404.html"));
cpSync(join(root, "scripts/quorradispatch-404.html"), join(out, "404.html"));
cpSync(join(root, "scripts/quorradispatch-worker.js"), join(out, "_worker.js"));

writeFileSync(join(out, "_redirects"), [
  "# Exact paths before splats. SPA deep links are _worker.js, not a 200 rewrite:",
  "# Pages drops \"/app/* /app/index.html 200\" and would serve the landing page.",
  "/field-test     /test/         301",
  "/field          /app/          301",
  "/dispatch/privacy/  /privacy/  301",
  "/dispatch/privacy   /privacy/  301",
  "/dispatch/      /              301",
  "/dispatch       /              301",
  "/app            /app/          301",
  "/test           /test/         301",
  "/privacy        /privacy/      301",
  "/field-test/*   /test/:splat   301",
  "/field/*        /app/:splat    301",
  "",
].join("\n"));

console.log(`Built ${out}`);
