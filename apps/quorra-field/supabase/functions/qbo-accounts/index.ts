// Lists the QuickBooks accounts a payment can be deposited into (bank accounts and Undeposited Funds). Signed-in team members only.
import { accountOwner, handler, json, requireUser } from "../_shared/util.ts";
import { assertFeature } from "../_shared/plan.ts";
import { getConnection, qboQuery } from "../_shared/qbo.ts";

handler(async (req) => {
  const user = await requireUser(req);
  const ownerId = await accountOwner(user.id);
  await assertFeature(ownerId, "qbo");
  const conn = await getConnection(ownerId);
  const r = await qboQuery(conn, "select Id, Name, AccountType, AccountSubType from Account where Active = true and AccountType in ('Bank', 'Other Current Asset') maxresults 200");
  const accounts = ((r?.Account ?? []) as { Id: string; Name: string; AccountType: string; AccountSubType: string }[])
    .filter((a) => a.AccountType === "Bank" || a.AccountSubType === "UndepositedFunds")
    .map((a) => ({ id: a.Id, name: a.Name, type: a.AccountSubType === "UndepositedFunds" ? "undeposited" : "bank" }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return json({ accounts });
});
