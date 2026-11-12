// Pages ignores "/app/* /app/index.html 200" (it treats that as a loop) and,
// with no root 404.html, serves the landing page for every unknown path.
// This worker runs after static files and the _redirects 301s. A missing
// /app or /test path is a 404 whose body is that app's index, returned as 200.
// Extensionless visits that belong to a real html file (quote, portal, lead)
// get that file, because Pages redirects /app/quote.html to /app/quote.
//
// Pages also ignores a _headers file that Vite copied under /app/, and would
// publish that file at /app/_headers. Security headers are set here instead.
// The landing site keeps its own inline scripts and Google Fonts, so it does
// not get the app Content-Security-Policy.

const APP_CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "connect-src 'self' https://vlwsrrbofnnatctezsmn.supabase.co wss://vlwsrrbofnnatctezsmn.supabase.co https://api.stripe.com https://r.stripe.com https://m.stripe.com https://js.stripe.com https://cloudflareinsights.com",
  "script-src 'self' https://js.stripe.com https://static.cloudflareinsights.com 'sha256-0vEmG7vKr3CQwQFbpTROeFCFxWvFhpV4fwFvbe/m+mA='",
  "frame-src https://js.stripe.com https://hooks.stripe.com https://checkout.stripe.com",
  "img-src 'self' data: blob: https:",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
].join("; ");

export function isAppPath(pathname) {
  return pathname === "/app" || pathname.startsWith("/app/") || pathname === "/test" || pathname.startsWith("/test/");
}

function requestHost(requestUrl) {
  if (!requestUrl) return "";
  if (typeof requestUrl === "string") {
    try {
      return new URL(requestUrl).hostname.toLowerCase();
    } catch {
      return "";
    }
  }
  if (typeof requestUrl.hostname === "string") return requestUrl.hostname.toLowerCase();
  return "";
}

/** /app is a thin shell. *.pages.dev is the duplicate host.
 *  /test/ stays Disallow in robots.txt and is not marked noindex on the public domain. */
export function shouldNoindex(pathname, requestUrl) {
  if (pathname === "/app" || pathname.startsWith("/app/")) return true;
  return requestHost(requestUrl).endsWith(".pages.dev");
}

/** HSTS and nosniff on every response. The app CSP only on /app and /test.
 *  Pages does not apply _headers to responses this worker returns, so the
 *  noindex rules in the root _headers file are repeated here. */
export function applySecurityHeaders(response, pathname, requestUrl) {
  const headers = new Headers(response.headers);
  headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  headers.set("X-Content-Type-Options", "nosniff");
  if (shouldNoindex(pathname, requestUrl)) headers.set("X-Robots-Tag", "noindex");
  if (isAppPath(pathname)) {
    headers.set("Content-Security-Policy", APP_CSP);
    headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    headers.set("X-Frame-Options", "DENY");
    headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(self \"https://js.stripe.com\")");
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const asset = await env.ASSETS.fetch(request);
    const spa = isAppPath(path);
    const looksLikeFile = /\.[a-z0-9]+$/i.test(path);
    if (asset.status !== 404 || !spa || looksLikeFile) return applySecurityHeaders(asset, path, url);

    const htmlUrl = new URL(path.replace(/\/$/, "") + ".html", url.origin);
    const html = await env.ASSETS.fetch(htmlUrl);
    if (html.status === 200) {
      return applySecurityHeaders(new Response(html.body, { status: 200, headers: html.headers }), path, url);
    }
    return applySecurityHeaders(new Response(asset.body, { status: 200, headers: asset.headers }), path, url);
  },
};
