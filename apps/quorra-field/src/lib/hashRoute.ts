/**
 * The production app uses the URL path. Partner links are shared with a hash
 * route (`/app/#/start?...`). Rewrite that hash into the path before the router
 * starts. HashRouter builds already read the hash, so they skip this.
 */
export function browserPathFromHash(hash: string, base: string): string | null {
  if (!hash.startsWith("#/")) return null;
  const next = hash.slice(1);
  if (!next.startsWith("/")) return null;
  const root = (base || "/").replace(/\/$/, "");
  return `${root}${next}`;
}
