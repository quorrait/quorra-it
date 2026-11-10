// Server copy of the seat numbers and upgrade names in src/lib/plans.ts.
// The allow/deny decision itself is plan_allows() in the database, so the two cannot drift on a check.
import { admin, HttpError } from "./util.ts";

const NAMES: Record<string, string> = { basic: "Basic", essentials: "Essentials", enterprise: "Enterprise" };
const SEATS: Record<string, number> = { basic: 1, essentials: 5, enterprise: 15 };
const ENTERPRISE = new Set(["qbo", "custom_layout", "reports", "booking_rules"]);

/** Same sentence as downgradeLoginMessage() in src/lib/plans.ts. */
export function downgradeLoginMessage(active: number, plan: string): string | null {
  const limit = SEATS[plan];
  if (limit == null || active <= limit) return null;
  return `You have ${active} logins; ${NAMES[plan]} allows ${limit}. Deactivate ${active - limit} to switch.`;
}

export async function featureOn(ownerId: string, feature: string): Promise<boolean> {
  const { data, error } = await admin().rpc("plan_allows", { p_owner: ownerId, p_feature: feature });
  if (error) return false;
  return data === true;
}

export async function assertFeature(ownerId: string, feature: string) {
  const { data, error } = await admin().rpc("plan_allows", { p_owner: ownerId, p_feature: feature });
  if (error) throw new HttpError(503, "Plan check failed. Apply the plan gating database update, then try again.");
  if (!data) throw new HttpError(403, `Upgrade to ${ENTERPRISE.has(feature) ? "Enterprise" : "Essentials"} to use this.`);
}

export async function assertInviteAllowed(ownerId: string, teamMemberId: string) {
  const { data, error } = await admin().rpc("can_send_invite", { p_owner: ownerId, p_team_member: teamMemberId });
  if (error) throw new HttpError(503, "Plan check failed. Apply the plan gating database update, then try again.");
  if (!data) throw new HttpError(409, "This plan's login limit is full. Deactivate a login on the Team page, or upgrade, before sending another invite.");
}

export async function activeLogins(ownerId: string): Promise<number> {
  const { data, error } = await admin().rpc("active_login_count", { p_owner: ownerId });
  if (error || typeof data !== "number") throw new HttpError(503, "Apply the plan gating database update before changing plans.");
  return data;
}
