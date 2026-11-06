// Returns the Intuit consent URL for the signed-in contractor.
import { env, handler, json, requireUser } from "../_shared/util.ts";
import { QBO_AUTH_URL, redirectUri, signState } from "../_shared/qbo.ts";

handler(async (req) => {
  const user = await requireUser(req);
  const params = new URLSearchParams({
    client_id: env("QBO_CLIENT_ID"),
    response_type: "code",
    scope: "com.intuit.quickbooks.accounting",
    redirect_uri: redirectUri(),
    state: await signState(user.id),
  });
  return json({ url: `${QBO_AUTH_URL}?${params}` });
});
