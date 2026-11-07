import type { Estimate } from "./types";
import { invoiceTotals } from "./money";

/**
 * Local price guide.
 *
 * Market figures are PUBLISHED NATIONAL RANGES (cited per entry) scaled by the
 * state's price level. They are reference points, not live quotes from local
 * competitors, and the screen says so. Amounts are whole dollars.
 */

export const RPP_SOURCE = {
  name: "U.S. Bureau of Economic Analysis, Regional Price Parities by State (2023)",
  url: "https://www.bea.gov/data/prices-inflation/regional-price-parities-state-and-metro-area",
};

/** All-items regional price parity, 2023 (US average = 100). */
export const STATE_PRICE_LEVEL: Record<string, number> = {
  AL: 90.0, AK: 101.7, AZ: 101.1, AR: 86.5, CA: 112.6, CO: 101.4, CT: 103.7, DE: 99.3, DC: 110.8, FL: 103.5,
  GA: 96.7, HI: 108.6, ID: 91.4, IL: 98.9, IN: 92.2, IA: 88.8, KS: 90.0, KY: 90.5, LA: 88.3, ME: 97.1,
  MD: 104.0, MA: 108.2, MI: 94.2, MN: 98.4, MS: 87.3, MO: 91.8, MT: 90.2, NE: 90.4, NV: 97.0, NH: 105.3,
  NJ: 108.9, NM: 90.4, NY: 107.6, NC: 94.1, ND: 88.6, OH: 91.8, OK: 88.3, OR: 104.7, PA: 97.5, RI: 101.4,
  SC: 93.2, SD: 88.1, TN: 92.5, TX: 97.2, UT: 95.0, VT: 96.6, VA: 100.7, WA: 108.6, WV: 89.8, WI: 93.1, WY: 90.8,
};

export const STATE_NAMES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut",
  DE: "Delaware", DC: "District of Columbia", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois",
  IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana",
  NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York",
  NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania",
  RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah",
  VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};

export interface PriceRef {
  id: string;
  trade: "Plumbing" | "HVAC" | "Electrical";
  job: string;
  /** Lowercase phrases matched against the quote title and line items. */
  keywords: string[];
  low: number;
  avg: number | null;
  high: number;
  /** Set when the figure is per unit (e.g. per light) rather than a whole-job price. */
  unit?: string;
  note?: string;
  source: string;
  url: string;
  asOf: string;
}

const ANGI = "Angi cost guide";
const FIXR = "Fixr cost guide";
const F = (slug: string) => `https://www.fixr.com/costs/${slug}`;
const U = (slug: string) => `https://www.angi.com/articles/${slug}.htm`;

export const PRICE_REFS: PriceRef[] = [
  { id: "water-heater", trade: "Plumbing", job: "Water heater replacement", keywords: ["water heater", "hot water heater"], low: 837, avg: 1256, high: 1675, note: "Installed, materials and labor.", source: ANGI, url: U("how-much-does-water-heater-installation-cost"), asOf: "page last updated Nov 2022" },
  { id: "wh-tank-gas", trade: "Plumbing", job: "Water heater: gas tank", keywords: ["gas water heater", "natural gas water heater", "gas tank water heater", "gas tank"], low: 900, avg: 1400, high: 3000, note: "Installed, natural gas tank unit.", source: FIXR, url: F("install-water-heater"), asOf: "updated Jan 2026" },
  { id: "wh-tank-electric", trade: "Plumbing", job: "Water heater: electric tank", keywords: ["electric water heater", "electric tank"], low: 500, avg: null, high: 3500, note: "Installed. Range is for electric units.", source: FIXR, url: F("install-water-heater"), asOf: "updated Jan 2026" },
  { id: "wh-40", trade: "Plumbing", job: "Water heater: 40 gallon tank", keywords: ["40 gallon", "40-gallon", "40 gal"], low: 550, avg: null, high: 2300, note: "Installed, 40 gallon tank.", source: FIXR, url: F("install-water-heater"), asOf: "updated Jan 2026" },
  { id: "wh-50", trade: "Plumbing", job: "Water heater: 50 gallon tank", keywords: ["50 gallon", "50-gallon", "50 gal"], low: 700, avg: null, high: 2500, note: "Installed, 50 gallon tank.", source: FIXR, url: F("install-water-heater"), asOf: "updated Jan 2026" },
  { id: "wh-tankless", trade: "Plumbing", job: "Water heater: tankless", keywords: ["tankless"], low: 1000, avg: null, high: 4000, note: "Installed, all fuel types. Gas venting or a new gas line can add cost.", source: FIXR, url: F("install-water-heater"), asOf: "updated Jan 2026" },
  { id: "wh-heatpump", trade: "Plumbing", job: "Water heater: heat pump / hybrid", keywords: ["heat pump water heater", "hybrid water heater", "heat pump"], low: 1200, avg: null, high: 4600, note: "Installed. Rebates may apply.", source: FIXR, url: F("install-water-heater"), asOf: "updated Jan 2026" },
  { id: "drain", trade: "Plumbing", job: "Drain cleaning", keywords: ["drain", "clog", "snake", "sewer"], low: 147, avg: 241, high: 345, note: "Typical clog. Main sewer line work can run higher.", source: ANGI, url: U("how-much-does-drain-cleaning-cost"), asOf: "2025" },
  { id: "toilet", trade: "Plumbing", job: "Toilet installation", keywords: ["toilet"], low: 224, avg: 373, high: 532, note: "Source is unclear whether the fixture is included.", source: ANGI, url: U("how-much-does-toilet-installation-cost"), asOf: "page last updated Nov 2022" },
  { id: "ac-replace", trade: "HVAC", job: "AC replacement", keywords: ["ac replacement", "replace ac", "condenser", "air conditioner", "a/c replacement", "new ac"], low: 3911, avg: 5989, high: 8067, note: "Assumes existing ductwork and electrical.", source: ANGI, url: U("how-much-does-installing-new-ac-cost"), asOf: "2026" },
  { id: "furnace", trade: "HVAC", job: "Furnace replacement", keywords: ["furnace"], low: 2825, avg: null, high: 6883, source: ANGI, url: U("how-much-does-it-cost-install-new-furnace"), asOf: "2025" },
  { id: "hvac-tune", trade: "HVAC", job: "HVAC tune-up / maintenance", keywords: ["tune-up", "tune up", "tuneup", "maintenance", "seasonal service", "inspection"], low: 175, avg: 250, high: 350, source: ANGI, url: U("ac-service-cost"), asOf: "2025" },
  { id: "mini-split", trade: "HVAC", job: "Ductless mini-split (single zone)", keywords: ["mini-split", "mini split", "ductless"], low: 2000, avg: 3000, high: 3000, note: "Basic model with labor, and a 12,000 BTU unit at about $3,000.", source: ANGI, url: U("how-much-does-it-cost-install-ductless-mini-split-ac"), asOf: "page updated Jan 2022" },
  { id: "panel", trade: "Electrical", job: "Electrical panel replacement", keywords: ["panel", "breaker box", "service upgrade"], low: 518, avg: 1344, high: 2190, note: "Moving the panel or raising amperage can cost more.", source: ANGI, url: U("cost-replace-circuit-breaker-box"), asOf: "undated page" },
  { id: "ev", trade: "Electrical", job: "EV charger installation (Level 2)", keywords: ["ev charger", "charging station", "car charger", "level 2"], low: 400, avg: 1100, high: 1200, source: ANGI, url: U("installing-electric-car-charging-station"), asOf: "page last updated Nov 2022" },
  { id: "ceiling-fan", trade: "Electrical", job: "Ceiling fan installation", keywords: ["ceiling fan"], low: 145, avg: 250, high: 355, note: "New wiring or reinforcement costs more.", source: ANGI, url: U("how-much-does-ceiling-fan-installation-cost"), asOf: "2025" },
  { id: "recessed", trade: "Electrical", job: "Recessed lighting", keywords: ["recessed", "can light", "pot light"], low: 100, avg: null, high: 300, unit: "per light", source: ANGI, url: U("how-much-does-it-cost-install-recessed-lighting"), asOf: "2026" },
];

export function matchRefs(text: string, max = 3): PriceRef[] {
  const t = text.toLowerCase();
  const found = PRICE_REFS
    .map((r) => ({ r, score: r.keywords.filter((k) => t.includes(k)).length * 10 + (t.includes(r.job.toLowerCase()) ? 5 : 0) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.r);
  // A specific water heater type (size, fuel, tankless) is more useful than the general range.
  const specific = found.some((r) => r.id.startsWith("wh-"));
  return found.filter((r) => !(specific && r.id === "water-heater")).slice(0, max);
}

const round = (n: number) => (n >= 1000 ? Math.round(n / 25) * 25 : Math.round(n / 5) * 5);

export interface LocalRange { low: number; avg: number | null; high: number; factor: number }

/** Scale the national range by the state's price level. No state means no adjustment. */
export function localize(ref: PriceRef, state?: string | null): LocalRange {
  const level = state ? STATE_PRICE_LEVEL[state.toUpperCase()] : undefined;
  const factor = level ? level / 100 : 1;
  return { low: round(ref.low * factor), avg: ref.avg === null ? null : round(ref.avg * factor), high: round(ref.high * factor), factor };
}

export interface History { count: number; low: number; avg: number; high: number }

/** The contractor's own earlier estimates for the same kind of job (before tax, in dollars). */
export function ownHistory(ref: PriceRef, estimates: Estimate[], excludeId?: string): History | null {
  const vals = estimates
    .filter((e) => e.id !== excludeId && ref.keywords.some((k) => (e.title + " " + e.items.map((i) => i.description).join(" ")).toLowerCase().includes(k)))
    .map((e) => invoiceTotals(e).subtotal / 100)
    .filter((v) => v > 0);
  if (!vals.length) return null;
  return { count: vals.length, low: Math.min(...vals), avg: vals.reduce((s, v) => s + v, 0) / vals.length, high: Math.max(...vals) };
}

export type Position = "below" | "within" | "above";
export function position(amount: number, r: { low: number; high: number }): Position {
  return amount < r.low ? "below" : amount > r.high ? "above" : "within";
}
