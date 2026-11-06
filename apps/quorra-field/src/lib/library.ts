import type { PriceCategory, TemplateKind } from "./types";

/** Starter packs a contractor can add in one tap. Prices are typical-market placeholders to edit, in dollars. */
export interface LibItem { name: string; description: string; category: PriceCategory; price: number; cost: number }
export interface LibTemplate { kind: TemplateKind; name: string; title: string; notes: string; hours: number; items: { description: string; qty: number; price: number }[] }
export interface LibPack { trade: string; blurb: string; items: LibItem[]; templates: LibTemplate[] }

const L = (name: string, price: number, cost: number, description = ""): LibItem => ({ name, description, category: "Labor", price, cost });
const M = (name: string, price: number, cost: number, description = ""): LibItem => ({ name, description, category: "Material", price, cost });
const S = (name: string, price: number, cost: number, description = ""): LibItem => ({ name, description, category: "Service", price, cost });
const E = (name: string, price: number, cost: number, description = ""): LibItem => ({ name, description, category: "Equipment", price, cost });

export const LIBRARY: LibPack[] = [
  {
    trade: "HVAC",
    blurb: "Tune-ups, repairs, installs",
    items: [
      S("Diagnostic / service call", 129, 25, "Trip charge and system diagnosis"),
      S("AC tune-up", 149, 30, "21-point seasonal inspection and cleaning"),
      S("Furnace tune-up", 139, 30, "Safety and efficiency check"),
      L("HVAC technician labor (hr)", 125, 38),
      M("Capacitor", 85, 18, "Run/start capacitor"),
      M("Contactor", 95, 22),
      M("Refrigerant R-410A (lb)", 75, 28),
      M("Air filter (MERV 8)", 28, 7),
      M("Condensate pump", 165, 55),
      E("3-ton AC condenser", 3200, 1650, "Equipment only"),
      E("2-ton ductless mini-split", 2180, 1150),
      S("Duct sealing", 650, 180),
    ],
    templates: [
      { kind: "estimate", name: "AC tune-up", title: "Seasonal AC tune-up", notes: "Includes 21-point inspection, coil check and filter inspection.", hours: 1.5, items: [{ description: "AC tune-up", qty: 1, price: 149 }] },
      { kind: "estimate", name: "Capacitor replacement", title: "AC capacitor replacement", notes: "90-day parts and labor warranty.", hours: 1, items: [{ description: "Diagnostic / service call", qty: 1, price: 129 }, { description: "Capacitor", qty: 1, price: 85 }, { description: "HVAC technician labor (hr)", qty: 1, price: 125 }] },
      { kind: "estimate", name: "AC system replacement", title: "Replace AC condenser (3-ton)", notes: "Includes haul-away and 10-year parts warranty.", hours: 8, items: [{ description: "3-ton AC condenser", qty: 1, price: 3200 }, { description: "HVAC technician labor (hr)", qty: 8, price: 125 }, { description: "Refrigerant R-410A (lb)", qty: 4, price: 75 }] },
      { kind: "job", name: "AC tune-up visit", title: "AC tune-up", notes: "Check coils, filter, refrigerant pressure, thermostat.", hours: 1.5, items: [] },
      { kind: "job", name: "No-cool service call", title: "AC not cooling", notes: "Diagnose and quote on site.", hours: 2, items: [] },
    ],
  },
  {
    trade: "Plumbing",
    blurb: "Water heaters, drains, fixtures",
    items: [
      S("Service call / diagnostic", 119, 20),
      L("Plumber labor (hr)", 135, 40),
      S("Drain cleaning (main line)", 295, 40),
      S("Drain cleaning (fixture)", 175, 25),
      S("Camera inspection", 275, 60),
      M("Water heater 40 gal (gas)", 1150, 620),
      M("Water heater 50 gal (electric)", 1050, 560),
      M("Toilet (standard)", 285, 130),
      M("Kitchen faucet", 245, 95),
      M("Garbage disposal 1/2 HP", 235, 95),
      M("Supply line / shutoff valve", 45, 12),
      S("Backflow test", 195, 35),
    ],
    templates: [
      { kind: "estimate", name: "Water heater replacement (40 gal)", title: "Water heater replacement (40 gal gas)", notes: "Includes permit, haul-away of old unit, 6-year tank warranty.", hours: 4, items: [{ description: "Water heater 40 gal (gas)", qty: 1, price: 1150 }, { description: "Plumber labor (hr)", qty: 3, price: 135 }, { description: "Supply line / shutoff valve", qty: 2, price: 45 }] },
      { kind: "estimate", name: "Drain clearing", title: "Clear clogged drain", notes: "No-clear, no-charge on drain cleaning.", hours: 1.5, items: [{ description: "Service call / diagnostic", qty: 1, price: 119 }, { description: "Drain cleaning (fixture)", qty: 1, price: 175 }] },
      { kind: "estimate", name: "Toilet install", title: "Toilet replacement", notes: "", hours: 2, items: [{ description: "Toilet (standard)", qty: 1, price: 285 }, { description: "Plumber labor (hr)", qty: 1.5, price: 135 }] },
      { kind: "job", name: "Water heater swap", title: "Water heater replacement", notes: "Confirm gas/electric and shutoff location.", hours: 4, items: [] },
      { kind: "job", name: "Leak call", title: "Leak repair", notes: "Locate leak, shut off water, quote repair.", hours: 2, items: [] },
    ],
  },
  {
    trade: "Electrical",
    blurb: "Panels, circuits, lighting",
    items: [
      S("Service call / troubleshooting", 125, 20),
      L("Electrician labor (hr)", 130, 42),
      S("Panel upgrade 100A to 200A", 2800, 1250),
      S("EV charger install (240V)", 950, 380),
      M("GFCI outlet", 38, 14),
      M("Standard outlet / switch", 18, 4),
      M("Recessed LED light", 75, 22),
      M("Ceiling fan install kit", 160, 60),
      M("Smoke / CO detector", 55, 22),
      M("Breaker (standard)", 28, 9),
      S("Whole-home surge protector", 395, 140),
      S("Permit and inspection", 250, 150),
    ],
    templates: [
      { kind: "estimate", name: "Panel upgrade", title: "Panel upgrade 100A to 200A", notes: "Includes permit, inspection and utility coordination.", hours: 8, items: [{ description: "Panel upgrade 100A to 200A", qty: 1, price: 2800 }, { description: "Permit and inspection", qty: 1, price: 250 }] },
      { kind: "estimate", name: "EV charger", title: "EV charger install", notes: "Customer supplies charger unless listed.", hours: 3, items: [{ description: "EV charger install (240V)", qty: 1, price: 950 }] },
      { kind: "estimate", name: "Recessed lighting (6)", title: "Install 6 recessed lights", notes: "", hours: 3, items: [{ description: "Recessed LED light", qty: 6, price: 75 }, { description: "Electrician labor (hr)", qty: 3, price: 130 }] },
      { kind: "job", name: "Troubleshooting call", title: "Electrical troubleshooting", notes: "Dead outlets / tripping breaker.", hours: 2, items: [] },
      { kind: "job", name: "Panel upgrade day", title: "Panel upgrade", notes: "Power off required. Notify customer.", hours: 8, items: [] },
    ],
  },
  {
    trade: "General construction",
    blurb: "Remodels, framing, finish work",
    items: [
      L("Carpenter labor (hr)", 95, 32),
      L("Laborer (hr)", 60, 22),
      S("Demolition and haul-away", 450, 120),
      S("Drywall patch and paint", 275, 70),
      S("Interior paint (per room)", 650, 200),
      S("Deck repair (per sq ft)", 28, 10),
      M("Lumber 2x4x8", 6, 3.5),
      M("Drywall sheet 4x8", 18, 11),
      M("Paint (gallon)", 48, 28),
      E("Dumpster rental (10 yd)", 425, 300),
      S("Permit allowance", 300, 200),
      S("Project management fee", 500, 0),
    ],
    templates: [
      { kind: "estimate", name: "Interior paint room", title: "Interior painting (per room)", notes: "Walls and ceiling, two coats. Furniture moved and covered.", hours: 8, items: [{ description: "Interior paint (per room)", qty: 1, price: 650 }] },
      { kind: "estimate", name: "Drywall repair", title: "Drywall patch and paint", notes: "", hours: 3, items: [{ description: "Drywall patch and paint", qty: 1, price: 275 }] },
      { kind: "estimate", name: "Small remodel", title: "Remodel scope", notes: "Allowance items listed. Change orders in writing.", hours: 16, items: [{ description: "Demolition and haul-away", qty: 1, price: 450 }, { description: "Carpenter labor (hr)", qty: 16, price: 95 }, { description: "Permit allowance", qty: 1, price: 300 }] },
      { kind: "job", name: "Site walk", title: "Site walkthrough and measure", notes: "Photos, measurements, scope notes.", hours: 1, items: [] },
      { kind: "job", name: "Full work day", title: "Construction day", notes: "", hours: 8, items: [] },
    ],
  },
];
