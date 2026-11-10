/** Public Dispatch site. Keep in step with src/lib/publicUrl.ts. */
export const PUBLIC_SITE_URL = "https://quorradispatch.com";
export const PUBLIC_APP_URL = `${PUBLIC_SITE_URL}/app`;

/** Inbox for Dispatch support. Set the SUPPORT_EMAIL secret to override. */
export const supportEmail = () => Deno.env.get("SUPPORT_EMAIL") || "support@quorrait.com";
