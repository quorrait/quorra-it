// Connection token for Tap to Pay. Signed-in user only (Verify JWT ON).
// The token and the location are created on the contractor's connected Stripe account (direct charges).
import Stripe from "https://esm.sh/stripe@16.12.0?target=denonext";
import { admin, env, handler, HttpError, json, requireUser, accountOwner } from "../_shared/util.ts";
import { parseUsAddress } from "../_shared/usAddress.ts";

handler(async (req) => {
  if (req.method !== "POST") throw new HttpError(405, "POST only");
  const user = await requireUser(req);
  const ownerId = await accountOwner(user.id);
  const db = admin();
  const { data: biz } = await db.from("business").select("name, address, stripe_account_id, stripe_connected, terminal_location_id").eq("owner_id", ownerId).maybeSingle();
  if (!biz?.stripe_account_id || !biz.stripe_connected) throw new HttpError(400, "Connect Stripe in Settings first");
  const stripe = new Stripe(env("STRIPE_SECRET_KEY"), { httpClient: Stripe.createFetchHttpClient() });
  const account = biz.stripe_account_id as string;
  const opts = { stripeAccount: account };

  let locationId = biz.terminal_location_id as string | null;
  if (locationId) {
    try {
      await stripe.terminal.locations.retrieve(locationId, opts);
    } catch {
      locationId = null;
    }
  }
  if (!locationId) {
    const address = parseUsAddress(biz.address);
    if (!address) throw new HttpError(400, "Set your business address in Settings as street, city, state, and ZIP before using Tap to Pay.");
    const location = await stripe.terminal.locations.create({
      display_name: (biz.name || "Business").slice(0, 1000),
      address,
    }, opts);
    locationId = location.id;
    await db.from("business").update({ terminal_location_id: locationId }).eq("owner_id", ownerId);
  }

  const token = await stripe.terminal.connectionTokens.create({}, opts);
  return json({ secret: token.secret, location_id: locationId });
});
