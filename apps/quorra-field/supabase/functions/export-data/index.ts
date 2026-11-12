// Signed-in export of the business tables. Verify JWT ON.
import { accountOwner, admin, handler, HttpError, json, requireUser } from "../_shared/util.ts";

const TABLES = ["customers", "jobs", "invoices", "estimates", "time_entries", "purchase_orders", "service_plans"] as const;

function csv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const keys = Object.keys(rows[0]);
  const cell = (v: unknown) => {
    const s = v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  };
  return [keys.join(","), ...rows.map((r) => keys.map((k) => cell(r[k])).join(","))].join("\n");
}

handler(async (req) => {
  if (req.method !== "POST") throw new HttpError(405, "POST only");
  const user = await requireUser(req);
  const owner = await accountOwner(user.id);
  const db = admin();
  const { data: phase, error } = await db.rpc("billing_phase", { p_owner: owner });
  if (error) throw new HttpError(500, "Server error");
  if (!["ok", "grace", "reviewer"].includes(String(phase))) throw new HttpError(403, "Update billing to export. This account can no longer be opened.");
  const files: { name: string; csv: string }[] = [];
  for (const table of TABLES) {
    const { data, error: readErr } = await db.from(table).select("*").eq("owner_id", owner);
    if (readErr) { console.error(readErr); throw new HttpError(500, "Server error"); }
    files.push({ name: `${table}.csv`, csv: csv((data ?? []) as Record<string, unknown>[]) });
  }
  return json({ files });
});
