import { useState } from "react";
import { errMsg } from "../lib/errors";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/app";
import { Field, Sheet, useToast } from "./ui";

/** Permanently deletes the signed-in owner's company and login. Used from Settings and from Billing (so a company stuck without a plan can be removed). */
export default function DeleteCompanySheet({ onClose }: { onClose(): void }) {
  const { email, signOut } = useAuth();
  const toast = useToast();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Sheet title="Delete your company" onClose={onClose}>
      <div className="stack">
        <div className="error-banner" style={{ margin: 0 }}>This permanently deletes your login, your company and everything in it: customers, jobs, estimates, invoices and team access. It also cancels your plan. It cannot be undone.</div>
        <Field label={`Type ${email ?? "your email"} to confirm`}><input className="input" value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" /></Field>
        <button className="btn danger block" disabled={busy || text.trim().toLowerCase() !== (email ?? "").toLowerCase()} onClick={async () => {
          setBusy(true);
          try {
            const { error } = await supabase!.functions.invoke("delete-account", { body: { confirm: text } });
            if (error) { let m = errMsg(error, "Could not delete"); try { const ctx = (error as { context?: Response }).context; if (ctx) m = (await ctx.json()).error ?? m; } catch { /* ignore */ } throw new Error(m); }
            await signOut(); location.reload();
          } catch (e) { toast(errMsg(e, "Could not delete")); setBusy(false); }
        }}>{busy ? "Deleting..." : "Delete everything"}</button>
      </div>
    </Sheet>
  );
}
