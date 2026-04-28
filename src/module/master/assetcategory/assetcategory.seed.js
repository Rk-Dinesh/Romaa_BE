// Built-in construction asset taxonomy.
// Used by the /seed endpoint to populate the master collection idempotently.
// Add new entries here, then re-run /seed — only missing entries are inserted.

export const ASSET_CATEGORY_SEED = [
  // ── Machinery → Earthmoving ─────────────────────────────────────────────
  { assetClass: "Machinery", category: "Earthmoving", subCategory: "Excavator",         trackingMode: "HOURS", requiresCompliance: true, requiresFuel: true, requiresGps: true, requiresOperator: true },
  { assetClass: "Machinery", category: "Earthmoving", subCategory: "Backhoe Loader",    trackingMode: "HOURS", requiresCompliance: true, requiresFuel: true, requiresGps: true, requiresOperator: true },
  { assetClass: "Machinery", category: "Earthmoving", subCategory: "Bulldozer",         trackingMode: "HOURS", requiresCompliance: true, requiresFuel: true, requiresGps: true, requiresOperator: true },
  { assetClass: "Machinery", category: "Earthmoving", subCategory: "Wheel Loader",      trackingMode: "HOURS", requiresCompliance: true, requiresFuel: true, requiresGps: true, requiresOperator: true },
  { assetClass: "Machinery", category: "Earthmoving", subCategory: "Skid Steer Loader", trackingMode: "HOURS", requiresFuel: true, requiresOperator: true },
  { assetClass: "Machinery", category: "Earthmoving", subCategory: "Trencher",          trackingMode: "HOURS", requiresFuel: true, requiresOperator: true },
  { assetClass: "Machinery", category: "Earthmoving", subCategory: "Motor Grader",      trackingMode: "HOURS", requiresCompliance: true, requiresFuel: true, requiresGps: true, requiresOperator: true },
  { assetClass: "Machinery", category: "Earthmoving", subCategory: "Scraper",           trackingMode: "HOURS", requiresFuel: true, requiresOperator: true },

  // ── Machinery → Lifting ─────────────────────────────────────────────────
  { assetClass: "Machinery", category: "Lifting", subCategory: "Tower Crane",     trackingMode: "HOURS", requiresCompliance: true, requiresOperator: true },
  { assetClass: "Machinery", category: "Lifting", subCategory: "Mobile Crane",    trackingMode: "HOURS", requiresCompliance: true, requiresFuel: true, requiresGps: true, requiresOperator: true },
  { assetClass: "Machinery", category: "Lifting", subCategory: "Crawler Crane",   trackingMode: "HOURS", requiresCompliance: true, requiresFuel: true, requiresOperator: true },
  { assetClass: "Machinery", category: "Lifting", subCategory: "Gantry Crane",    trackingMode: "HOURS", requiresCompliance: true, requiresOperator: true },
  { assetClass: "Machinery", category: "Lifting", subCategory: "Hydra",           trackingMode: "HOURS", requiresCompliance: true, requiresFuel: true, requiresOperator: true },
  { assetClass: "Machinery", category: "Lifting", subCategory: "Forklift",        trackingMode: "HOURS", requiresFuel: true, requiresOperator: true },
  { assetClass: "Machinery", category: "Lifting", subCategory: "Telehandler",     trackingMode: "HOURS", requiresFuel: true, requiresOperator: true },
  { assetClass: "Machinery", category: "Lifting", subCategory: "Boom Lift",       trackingMode: "HOURS", requiresFuel: true, requiresOperator: true },
  { assetClass: "Machinery", category: "Lifting", subCategory: "Scissor Lift",    trackingMode: "HOURS", requiresOperator: true },
  { assetClass: "Machinery", category: "Lifting", subCategory: "Material Hoist",  trackingMode: "HOURS", requiresOperator: true },
  { assetClass: "Machinery", category: "Lifting", subCategory: "Passenger Hoist", trackingMode: "HOURS", requiresCompliance: true, requiresOperator: true },

  // ── Machinery → Concrete Equipment ──────────────────────────────────────
  { assetClass: "Machinery", category: "Concrete Equipment", subCategory: "Transit Mixer",       trackingMode: "KILOMETERS", requiresCompliance: true, requiresFuel: true, requiresGps: true, requiresOperator: true },
  { assetClass: "Machinery", category: "Concrete Equipment", subCategory: "Concrete Pump (Boom)",trackingMode: "HOURS", requiresFuel: true, requiresOperator: true },
  { assetClass: "Machinery", category: "Concrete Equipment", subCategory: "Concrete Pump (Line)",trackingMode: "HOURS", requiresFuel: true, requiresOperator: true },
  { assetClass: "Machinery", category: "Concrete Equipment", subCategory: "Batching Plant",      trackingMode: "HOURS", requiresOperator: true },
  { assetClass: "Machinery", category: "Concrete Equipment", subCategory: "Concrete Mixer",      trackingMode: "HOURS", requiresFuel: true },
  { assetClass: "Machinery", category: "Concrete Equipment", subCategory: "Concrete Vibrator",   trackingMode: "HOURS" },
  { assetClass: "Machinery", category: "Concrete Equipment", subCategory: "Power Trowel",        trackingMode: "HOURS", requiresFuel: true },
  { assetClass: "Machinery", category: "Concrete Equipment", subCategory: "Floor Screed Machine",trackingMode: "HOURS", requiresFuel: true },
  { assetClass: "Machinery", category: "Concrete Equipment", subCategory: "Shotcrete Machine",   trackingMode: "HOURS", requiresFuel: true },

  // ── Machinery → Compaction ──────────────────────────────────────────────
  { assetClass: "Machinery", category: "Compaction", subCategory: "Soil Compactor",     trackingMode: "HOURS", requiresFuel: true, requiresOperator: true },
  { assetClass: "Machinery", category: "Compaction", subCategory: "Tandem Roller",      trackingMode: "HOURS", requiresFuel: true, requiresOperator: true },
  { assetClass: "Machinery", category: "Compaction", subCategory: "Vibratory Roller",   trackingMode: "HOURS", requiresFuel: true, requiresOperator: true },
  { assetClass: "Machinery", category: "Compaction", subCategory: "Plate Compactor",    trackingMode: "HOURS", requiresFuel: true },
  { assetClass: "Machinery", category: "Compaction", subCategory: "Rammer",             trackingMode: "HOURS", requiresFuel: true },

  // ── Machinery → Road Equipment ──────────────────────────────────────────
  { assetClass: "Machinery", category: "Road Equipment", subCategory: "Asphalt Paver",        trackingMode: "HOURS", requiresFuel: true, requiresOperator: true },
  { assetClass: "Machinery", category: "Road Equipment", subCategory: "Asphalt Mixing Plant", trackingMode: "HOURS", requiresOperator: true },
  { assetClass: "Machinery", category: "Road Equipment", subCategory: "Bitumen Sprayer",      trackingMode: "HOURS", requiresFuel: true },
  { assetClass: "Machinery", category: "Road Equipment", subCategory: "Road Marking Machine", trackingMode: "HOURS" },
  { assetClass: "Machinery", category: "Road Equipment", subCategory: "Cold Milling Machine", trackingMode: "HOURS", requiresFuel: true, requiresOperator: true },

  // ── Machinery → Drilling / Piling ───────────────────────────────────────
  { assetClass: "Machinery", category: "Drilling/Piling", subCategory: "Piling Rig",        trackingMode: "HOURS", requiresFuel: true, requiresOperator: true },
  { assetClass: "Machinery", category: "Drilling/Piling", subCategory: "Rotary Drill",      trackingMode: "HOURS", requiresFuel: true, requiresOperator: true },
  { assetClass: "Machinery", category: "Drilling/Piling", subCategory: "Rock Breaker",      trackingMode: "HOURS", requiresFuel: true, requiresOperator: true },
  { assetClass: "Machinery", category: "Drilling/Piling", subCategory: "Auger Drill",       trackingMode: "HOURS", requiresFuel: true },
  { assetClass: "Machinery", category: "Drilling/Piling", subCategory: "Hydraulic Hammer",  trackingMode: "HOURS" },
  { assetClass: "Machinery", category: "Drilling/Piling", subCategory: "Core Cutter",       trackingMode: "HOURS" },

  // ── Vehicle → Transport ─────────────────────────────────────────────────
  { assetClass: "Vehicle", category: "Transport", subCategory: "Tipper",             trackingMode: "KILOMETERS", requiresCompliance: true, requiresFuel: true, requiresGps: true, requiresOperator: true },
  { assetClass: "Vehicle", category: "Transport", subCategory: "Dumper",             trackingMode: "KILOMETERS", requiresCompliance: true, requiresFuel: true, requiresGps: true, requiresOperator: true },
  { assetClass: "Vehicle", category: "Transport", subCategory: "Trailer (Low-bed)",  trackingMode: "KILOMETERS", requiresCompliance: true, requiresFuel: true, requiresGps: true, requiresOperator: true },
  { assetClass: "Vehicle", category: "Transport", subCategory: "Trailer (Flatbed)",  trackingMode: "KILOMETERS", requiresCompliance: true, requiresFuel: true, requiresGps: true, requiresOperator: true },
  { assetClass: "Vehicle", category: "Transport", subCategory: "Water Tanker",       trackingMode: "KILOMETERS", requiresCompliance: true, requiresFuel: true, requiresGps: true, requiresOperator: true },
  { assetClass: "Vehicle", category: "Transport", subCategory: "Fuel Bowser",        trackingMode: "KILOMETERS", requiresCompliance: true, requiresFuel: true, requiresGps: true, requiresOperator: true },
  { assetClass: "Vehicle", category: "Transport", subCategory: "Pickup Truck",       trackingMode: "KILOMETERS", requiresCompliance: true, requiresFuel: true, requiresOperator: true },
  { assetClass: "Vehicle", category: "Transport", subCategory: "Staff Bus",          trackingMode: "KILOMETERS", requiresCompliance: true, requiresFuel: true, requiresGps: true, requiresOperator: true },
  { assetClass: "Vehicle", category: "Transport", subCategory: "Site Car",           trackingMode: "KILOMETERS", requiresCompliance: true, requiresFuel: true, requiresOperator: true },
  { assetClass: "Vehicle", category: "Transport", subCategory: "Bike",               trackingMode: "KILOMETERS", requiresCompliance: true, requiresFuel: true },

  // ── Stationary Plant ────────────────────────────────────────────────────
  { assetClass: "StationaryPlant", category: "Power", subCategory: "DG Set",            trackingMode: "HOURS", requiresFuel: true },
  { assetClass: "StationaryPlant", category: "Power", subCategory: "Air Compressor",    trackingMode: "HOURS" },
  { assetClass: "StationaryPlant", category: "Fabrication", subCategory: "Welding Machine",     trackingMode: "HOURS" },
  { assetClass: "StationaryPlant", category: "Fabrication", subCategory: "Cutting Torch",       trackingMode: "HOURS" },
  { assetClass: "StationaryPlant", category: "Fabrication", subCategory: "Bar Bending Machine", trackingMode: "HOURS" },
  { assetClass: "StationaryPlant", category: "Fabrication", subCategory: "Bar Cutting Machine", trackingMode: "HOURS" },
  { assetClass: "StationaryPlant", category: "Lab",         subCategory: "Cube Testing Machine",trackingMode: "UNITS" },
  { assetClass: "StationaryPlant", category: "Production",  subCategory: "Block Making Machine",trackingMode: "HOURS" },
  { assetClass: "StationaryPlant", category: "Production",  subCategory: "Stone Crusher",       trackingMode: "HOURS", requiresFuel: true, requiresOperator: true },
  { assetClass: "StationaryPlant", category: "Production",  subCategory: "Sand Washer",         trackingMode: "HOURS" },
  { assetClass: "StationaryPlant", category: "Production",  subCategory: "Wet Mix Plant",       trackingMode: "HOURS", requiresOperator: true },

  // ── Tool → Power Tools ──────────────────────────────────────────────────
  { assetClass: "Tool", category: "Power Tools", subCategory: "Drill Machine",       trackingMode: "NONE" },
  { assetClass: "Tool", category: "Power Tools", subCategory: "Grinder",             trackingMode: "NONE" },
  { assetClass: "Tool", category: "Power Tools", subCategory: "Cutter",              trackingMode: "NONE" },
  { assetClass: "Tool", category: "Power Tools", subCategory: "Vibrator Needle",     trackingMode: "NONE" },
  { assetClass: "Tool", category: "Power Tools", subCategory: "Jack Hammer",         trackingMode: "HOURS" },
  { assetClass: "Tool", category: "Power Tools", subCategory: "Demolition Breaker",  trackingMode: "HOURS" },
  { assetClass: "Tool", category: "Power Tools", subCategory: "Chainsaw",            trackingMode: "HOURS", requiresFuel: true },

  // ── Survey & Lab Equipment ──────────────────────────────────────────────
  { assetClass: "Survey", category: "Survey Instruments", subCategory: "Total Station", trackingMode: "NONE" },
  { assetClass: "Survey", category: "Survey Instruments", subCategory: "Auto Level",    trackingMode: "NONE" },
  { assetClass: "Survey", category: "Survey Instruments", subCategory: "Theodolite",    trackingMode: "NONE" },
  { assetClass: "Survey", category: "Survey Instruments", subCategory: "Laser Level",   trackingMode: "NONE" },
  { assetClass: "Survey", category: "Survey Instruments", subCategory: "GPS / DGPS",    trackingMode: "NONE" },
  { assetClass: "Survey", category: "Survey Instruments", subCategory: "Drone",         trackingMode: "HOURS" },

  // ── Formwork & Scaffolding (consumable / reusable inventory) ────────────
  { assetClass: "Formwork", category: "Shuttering",  subCategory: "Steel Shuttering Plate", trackingMode: "QUANTITY", isConsumable: true, defaultUnit: "Nos" },
  { assetClass: "Formwork", category: "Shuttering",  subCategory: "Aluminium Formwork",     trackingMode: "QUANTITY", isConsumable: true, defaultUnit: "Sqm" },
  { assetClass: "Formwork", category: "Shuttering",  subCategory: "Plywood Sheet",          trackingMode: "QUANTITY", isConsumable: true, defaultUnit: "Nos" },
  { assetClass: "Formwork", category: "Scaffolding", subCategory: "Acrow Prop",             trackingMode: "QUANTITY", isConsumable: true, defaultUnit: "Nos" },
  { assetClass: "Formwork", category: "Scaffolding", subCategory: "Cup-lock Scaffolding",   trackingMode: "QUANTITY", isConsumable: true, defaultUnit: "Set" },
  { assetClass: "Formwork", category: "Scaffolding", subCategory: "H-Frame Scaffolding",    trackingMode: "QUANTITY", isConsumable: true, defaultUnit: "Set" },
  { assetClass: "Formwork", category: "Shuttering",  subCategory: "Slab Decking",           trackingMode: "QUANTITY", isConsumable: true, defaultUnit: "Sqm" },
  { assetClass: "Formwork", category: "Shuttering",  subCategory: "Wall Form",              trackingMode: "QUANTITY", isConsumable: true, defaultUnit: "Sqm" },
  { assetClass: "Formwork", category: "Shuttering",  subCategory: "Column Form",            trackingMode: "QUANTITY", isConsumable: true, defaultUnit: "Nos" },
  { assetClass: "Formwork", category: "Shuttering",  subCategory: "Climbing Formwork",      trackingMode: "QUANTITY", isConsumable: true, defaultUnit: "Set" },

  // ── Site Infrastructure ─────────────────────────────────────────────────
  { assetClass: "SiteInfra", category: "Cabins",    subCategory: "Site Office Cabin",    trackingMode: "UNITS", defaultUnit: "Nos" },
  { assetClass: "SiteInfra", category: "Cabins",    subCategory: "Porta-cabin",          trackingMode: "UNITS", defaultUnit: "Nos" },
  { assetClass: "SiteInfra", category: "Cabins",    subCategory: "Labour Quarters",      trackingMode: "UNITS", defaultUnit: "Nos" },
  { assetClass: "SiteInfra", category: "Cabins",    subCategory: "Toilet Cabin",         trackingMode: "UNITS", defaultUnit: "Nos" },
  { assetClass: "SiteInfra", category: "Storage",   subCategory: "Storage Container 20ft", trackingMode: "UNITS", defaultUnit: "Nos" },
  { assetClass: "SiteInfra", category: "Storage",   subCategory: "Storage Container 40ft", trackingMode: "UNITS", defaultUnit: "Nos" },
  { assetClass: "SiteInfra", category: "Security",  subCategory: "Watch Tower",          trackingMode: "UNITS", defaultUnit: "Nos" },
  { assetClass: "SiteInfra", category: "Security",  subCategory: "Site Fencing",         trackingMode: "QUANTITY", isConsumable: true, defaultUnit: "Mtr" },
  { assetClass: "SiteInfra", category: "Cover",     subCategory: "Tarpaulin",            trackingMode: "QUANTITY", isConsumable: true, defaultUnit: "Sqm" },
  { assetClass: "SiteInfra", category: "Lighting",  subCategory: "Light Tower",          trackingMode: "HOURS", requiresFuel: true },
  { assetClass: "SiteInfra", category: "Lighting",  subCategory: "Solar Light",          trackingMode: "UNITS", defaultUnit: "Nos" },

  // ── Safety Equipment / PPE ──────────────────────────────────────────────
  { assetClass: "SafetyEquipment", category: "PPE",          subCategory: "Helmet",            trackingMode: "QUANTITY", isConsumable: true, defaultUnit: "Nos" },
  { assetClass: "SafetyEquipment", category: "PPE",          subCategory: "Safety Shoes",      trackingMode: "QUANTITY", isConsumable: true, defaultUnit: "Pair" },
  { assetClass: "SafetyEquipment", category: "Fall Arrest",  subCategory: "Harness",           trackingMode: "QUANTITY", isConsumable: true, defaultUnit: "Nos" },
  { assetClass: "SafetyEquipment", category: "Fall Arrest",  subCategory: "Life Line",         trackingMode: "QUANTITY", isConsumable: true, defaultUnit: "Mtr" },
  { assetClass: "SafetyEquipment", category: "Fall Arrest",  subCategory: "Safety Net",        trackingMode: "QUANTITY", isConsumable: true, defaultUnit: "Sqm" },
  { assetClass: "SafetyEquipment", category: "Fire Safety",  subCategory: "Fire Extinguisher", trackingMode: "UNITS", defaultUnit: "Nos" },
  { assetClass: "SafetyEquipment", category: "Medical",      subCategory: "First Aid Kit",     trackingMode: "UNITS", defaultUnit: "Nos" },
  { assetClass: "SafetyEquipment", category: "Detection",    subCategory: "Gas Detector",      trackingMode: "UNITS", defaultUnit: "Nos" },

  // ── IT & Office ─────────────────────────────────────────────────────────
  { assetClass: "IT", category: "Computing",     subCategory: "Laptop",         trackingMode: "UNITS", defaultUnit: "Nos" },
  { assetClass: "IT", category: "Computing",     subCategory: "Desktop",        trackingMode: "UNITS", defaultUnit: "Nos" },
  { assetClass: "IT", category: "Peripherals",   subCategory: "Printer",        trackingMode: "UNITS", defaultUnit: "Nos" },
  { assetClass: "IT", category: "Computing",     subCategory: "Tablet",         trackingMode: "UNITS", defaultUnit: "Nos" },
  { assetClass: "IT", category: "Communication", subCategory: "Mobile Phone",   trackingMode: "UNITS", defaultUnit: "Nos" },
  { assetClass: "IT", category: "Surveillance",  subCategory: "CCTV Camera",    trackingMode: "UNITS", defaultUnit: "Nos" },
  { assetClass: "IT", category: "Access Control",subCategory: "Biometric Device", trackingMode: "UNITS", defaultUnit: "Nos" },
  { assetClass: "IT", category: "Networking",    subCategory: "Router",         trackingMode: "UNITS", defaultUnit: "Nos" },

  // ── Furniture & Fixtures ────────────────────────────────────────────────
  { assetClass: "Furniture", category: "Office", subCategory: "Office Chair",  trackingMode: "QUANTITY", defaultUnit: "Nos" },
  { assetClass: "Furniture", category: "Office", subCategory: "Office Desk",   trackingMode: "QUANTITY", defaultUnit: "Nos" },
  { assetClass: "Furniture", category: "HVAC",   subCategory: "AC Unit",       trackingMode: "UNITS", defaultUnit: "Nos" },
  { assetClass: "Furniture", category: "Pantry", subCategory: "Water Cooler",  trackingMode: "UNITS", defaultUnit: "Nos" },
  { assetClass: "Furniture", category: "Pantry", subCategory: "Refrigerator",  trackingMode: "UNITS", defaultUnit: "Nos" },
];

// Build a deterministic CODE from category + subCategory.
// e.g. ("Earthmoving", "Excavator")  →  "MAC-EARTHMOVING-EXCAVATOR"
//      ("Transport",   "Tipper")     →  "VEH-TRANSPORT-TIPPER"
const CLASS_PREFIX = {
  Machinery: "MAC",
  Vehicle: "VEH",
  StationaryPlant: "STP",
  Tool: "TOL",
  Formwork: "FRM",
  SiteInfra: "INF",
  SafetyEquipment: "SAF",
  Survey: "SUR",
  IT: "ITX",
  Furniture: "FUR",
  Other: "OTH",
};

export function buildCode({ assetClass, category, subCategory }) {
  const prefix = CLASS_PREFIX[assetClass] || "OTH";
  const slug = (s) =>
    String(s || "")
      .replace(/[^A-Za-z0-9]+/g, "")
      .toUpperCase()
      .slice(0, 20);
  return `${prefix}-${slug(category)}-${slug(subCategory)}`;
}
