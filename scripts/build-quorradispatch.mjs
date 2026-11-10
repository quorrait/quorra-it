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

// Static files win over these rules. Splats only catch paths with no file,
// which is what the app's client-side router needs.
writeFileSync(join(out, "_redirects"), [
  "/field-test/*   /test/:splat   301",
  "/field-test     /test/         301",
  "/field/*        /app/:splat    301",
  "/field          /app/          301",
  "/dispatch/privacy/  /privacy/  301",
  "/dispatch/privacy   /privacy/  301",
  "/dispatch/      /              301",
  "/dispatch       /              301",
  "/app            /app/          301",
  "/test           /test/         301",
  "/privacy        /privacy/      301",
  "/app/*          /app/index.html  200",
  "/test/*         /test/index.html 200",
  "",
].join("\n"));

console.log(`Built ${out}`);
