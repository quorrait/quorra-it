import { hasSupabase } from "./supabase";

/** Where the Supabase edge functions live. Empty in demo mode. */
export const apiBase = () => (hasSupabase ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1` : "");

const root = () => `${location.origin}${import.meta.env.BASE_URL}`;

/** Standalone, public pages (no login) that talk to the edge functions. */
export const quoteUrl = (token?: string) => (hasSupabase && token ? `${root()}quote.html?t=${token}` : "");
export const portalUrl = (token?: string) => (hasSupabase && token ? `${root()}portal.html?t=${token}` : "");
export const leadFormUrl = (key?: string | null, name?: string) => (hasSupabase && key ? `${root()}lead.html?k=${key}${name ? `&n=${encodeURIComponent(name)}` : ""}` : "");
/** Sample customer portal with made-up data (demo mode and before going live). */
export const portalPreviewUrl = () => `${root()}portal.html?demo=1`;
/** Preview of the form that does not send anything (used in demo mode and before going live). */
export const leadFormPreviewUrl = (name?: string, cfg?: object) => `${root()}lead.html?demo=1${name ? `&n=${encodeURIComponent(name)}` : ""}${cfg ? `&cfg=${encodeURIComponent(btoa(unescape(encodeURIComponent(JSON.stringify(cfg)))))}` : ""}`;

/** Subscribable calendar feed. webcal:// opens the phone's calendar app directly. */
export const feedUrl = (token?: string | null) => (hasSupabase && token ? `${apiBase()}/calendar-feed/jobs.ics?t=${token}` : "");
export const webcalUrl = (token?: string | null) => feedUrl(token).replace(/^https?:/, "webcals:");
