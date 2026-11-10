import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const hasSupabase = Boolean(url && key);
export const supabase = hasSupabase
  ? createClient(url!, key!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // WKWebView's Web Locks implementation can hang getSession() forever, so the app never reaches login.
        lock: async (_name, _acquireTimeout, fn) => await fn(),
      },
    })
  : null;
