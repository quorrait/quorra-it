import { useEffect, useState } from "react";
import { hasSupabase, supabase } from "./supabase";

/** True when the signed-in user is listed as a platform admin (can open the Hub). */
export function useHubAdmin(): boolean {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    if (!hasSupabase || !supabase) return;
    void supabase.rpc("is_platform_admin").then(({ data }) => setOk(data === true), () => setOk(false));
  }, []);
  return ok;
}
