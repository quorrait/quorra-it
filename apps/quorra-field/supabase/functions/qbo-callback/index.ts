// Intuit redirects the browser here after the contractor approves access. Deploy with --no-verify-jwt.
import { admin, appUrl } from "../_shared/util.ts";
import { featureOn } from "../_shared/plan.ts";
import { exchangeCode, qbo, verifyState } from "../_shared/qbo.ts";

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const back = (result: string) => Response.redirect(`${appUrl()}/settings?qbo=${result}`, 302);

  try {
    if (url.searchParams.get("error")) return back("denied");
    const code = url.searchParams.get("code");
    const realm = url.searchParams.get("realmId");
    if (!code || !realm) return back("failed");

    const ownerId = await verifyState(url.searchParams.get("state"));
    if (!(await featureOn(ownerId, "qbo"))) return back("plan");
    const t = await exchangeCode(code);
    const db = admin();

    await db.from("qbo_connections").upsert({
      owner_id: ownerId,
      realm_id: realm,
      access_token: t.access_token,
      refresh_token: t.refresh_token,
      expires_at: new Date(Date.now() + t.expires_in * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    });

    let company = "QuickBooks company";
    try {
      const info = await qbo({ realm, token: t.access_token }, "GET", `companyinfo/${realm}`);
      company = info?.CompanyInfo?.CompanyName ?? company;
    } catch (e) {
      console.error("companyinfo failed", e);
    }
    await db.from("business").update({ qbo_connected: true, qbo_company: company }).eq("owner_id", ownerId);
    return back("connected");
  } catch (e) {
    console.error(e);
    return back("failed");
  }
});
