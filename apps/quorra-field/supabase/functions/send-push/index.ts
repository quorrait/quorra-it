// Sends a push for an existing account notification. Called with the service role.
// The live path is notifyAccount(), which uses the same sender directly.
import { admin, handler, HttpError, json } from "../_shared/util.ts";
import { pushToAccount } from "../_shared/push.ts";

handler(async (req) => {
  if (req.method !== "POST") throw new HttpError(405, "POST only");
  const expected = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const auth = req.headers.get("Authorization") ?? "";
  if (!expected || auth !== `Bearer ${expected}`) throw new HttpError(401, "Not allowed");
  const b = await req.json().catch(() => null);
  const ownerId = typeof b?.owner_id === "string" ? b.owner_id : "";
  const title = typeof b?.title === "string" ? b.title : "";
  if (!ownerId || !title) throw new HttpError(400, "owner_id and title are required");
  await pushToAccount(admin(), ownerId, {
    title,
    body: typeof b.body === "string" ? b.body : "",
    link: typeof b.link === "string" ? b.link : "",
    userId: typeof b.user_id === "string" ? b.user_id : undefined,
  });
  return json({ ok: true });
});
