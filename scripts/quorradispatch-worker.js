// Pages ignores "/app/* /app/index.html 200" (it treats that as a loop) and,
// with no root 404.html, serves the landing page for every unknown path.
// This worker runs after static files and the _redirects 301s. A missing
// /app or /test path is a 404 whose body is that app's index, returned as 200.
// Extensionless visits that belong to a real html file (quote, portal, lead)
// get that file, because Pages redirects /app/quote.html to /app/quote.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const asset = await env.ASSETS.fetch(request);
    const spa = path.startsWith("/app/") || path.startsWith("/test/");
    const looksLikeFile = /\.[a-z0-9]+$/i.test(path);
    if (asset.status !== 404 || !spa || looksLikeFile) return asset;

    const htmlUrl = new URL(path.replace(/\/$/, "") + ".html", url.origin);
    const html = await env.ASSETS.fetch(htmlUrl);
    if (html.status === 200) {
      return new Response(html.body, { status: 200, headers: html.headers });
    }
    return new Response(asset.body, { status: 200, headers: asset.headers });
  },
};
