import { admin, HttpError } from "./util.ts";

export function clientIp(req: Request): string {
  const cf = req.headers.get("cf-connecting-ip");
  if (cf) return cf.trim().slice(0, 80);
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim().slice(0, 80);
  return "unknown";
}

/** Counts recent calls from one IP. Needs the request_limits table. */
export async function rateLimit(bucket: string, ip: string, limit: number, windowSeconds: number): Promise<void> {
  const db = admin();
  const since = new Date(Date.now() - windowSeconds * 1000).toISOString();
  const { count, error } = await db.from("request_limits").select("id", { count: "exact", head: true }).eq("bucket", bucket).eq("ip", ip).gte("created_at", since);
  if (error) { console.error(error); throw new HttpError(500, "Server error"); }
  if ((count ?? 0) >= limit) throw new HttpError(429, "Too many requests. Please wait and try again.");
  const { error: ins } = await db.from("request_limits").insert({ bucket, ip });
  if (ins) { console.error(ins); throw new HttpError(500, "Server error"); }
}
