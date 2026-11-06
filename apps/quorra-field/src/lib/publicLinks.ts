import { hasSupabase } from "./supabase";

/** Where the Supabase edge functions live. Empty in demo mode. */
export const apiBase = () => (hasSupabase ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1` : "");

const root = () => `${location.origin}${import.meta.env.BASE_URL}`;

/** Standalone, public pages (no login) that talk to the edge functions. */
export const quoteUrl = (token?: string) => (hasSupabase && token ? `${root()}quote.html?t=${token}&api=${encodeURIComponent(apiBase())}` : "");
export const leadFormUrl = (key?: string | null) => (hasSupabase && key ? `${root()}lead.html?k=${key}&api=${encodeURIComponent(apiBase())}` : "");
