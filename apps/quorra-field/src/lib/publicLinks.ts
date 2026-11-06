import { hasSupabase } from "./supabase";

/** Where the Supabase edge functions live. Empty in demo mode. */
export const apiBase = () => (hasSupabase ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1` : "");

const root = () => `${location.origin}${import.meta.env.BASE_URL}`;

/** Standalone, public pages (no login) that talk to the edge functions. */
export const quoteUrl = (token?: string) => (hasSupabase && token ? `${root()}quote.html?t=${token}&api=${encodeURIComponent(apiBase())}` : "");
export const leadFormUrl = (key?: string | null) => (hasSupabase && key ? `${root()}lead.html?k=${key}&api=${encodeURIComponent(apiBase())}` : "");

/** Subscribable calendar feed. webcal:// opens the phone's calendar app directly. */
export const feedUrl = (token?: string | null) => (hasSupabase && token ? `${apiBase()}/calendar-feed/jobs.ics?t=${token}` : "");
export const webcalUrl = (token?: string | null) => feedUrl(token).replace(/^https?:/, "webcal:");
