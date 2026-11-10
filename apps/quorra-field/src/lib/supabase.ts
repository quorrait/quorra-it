import { createClient } from "@supabase/supabase-js";
import { demoRequested } from "./demoMode";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

const configured = Boolean(url && key);
/** Sample data for this tab. The Supabase client is not created, so nothing can reach a real project. */
export const demoMode = demoRequested();
export const hasSupabase = configured && !demoMode;
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
