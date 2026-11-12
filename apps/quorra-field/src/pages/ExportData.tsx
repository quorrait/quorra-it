import { useState } from "react";
import { Link } from "react-router-dom";
import { useToast } from "../components/ui";
import { errMsg } from "../lib/errors";
import { supabase } from "../lib/supabase";

/** Download the business tables as CSV files. Works during reviewer mode. */
export default function ExportData() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  async function run() {
    if (!supabase) return toast("Export is available on a live account.");
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("export-data", { body: {} });
      if (error) {
        let m = "";
        try { m = (await (error as { context?: Response }).context?.json())?.error ?? ""; } catch { /* ignore */ }
        throw new Error(m || error.message);
      }
      const files = (data?.files ?? []) as { name: string; csv: string }[];
      for (const file of files) {
        const blob = new Blob([file.csv], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = file.name;
        a.click();
        URL.revokeObjectURL(url);
      }
      toast(files.length ? "Downloads started" : "Nothing to export");
    } catch (e) {
      toast(errMsg(e, "Could not export."));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="stack">
      <h1 className="page-title">Export</h1>
      <p className="muted">Download customers, jobs, invoices, estimates, timesheets, purchase orders, and service plans as CSV files. Paying restores the ability to make changes.</p>
      <button className="btn primary" disabled={busy} onClick={() => void run()}>{busy ? "Preparing..." : "Download CSV files"}</button>
      <Link to="/billing">Update billing</Link>
    </div>
  );
}
