import mongoose, { Schema } from "mongoose";
import { auditPlugin } from "../../audit/auditlog.plugin.js";

// ── Sub-components: tyres, batteries ──────────────────────────────────────────
// Wear-out parts attached to a machine. Each entry tracks installation point
// (HMR/KMs at fitment), expected life, and replacement event. Used for cost
// allocation and wear-out alerting (e.g. "tyre at 95% of expected life").
const SubComponentSchema = new Schema(
  {
    componentType: {
      type: String,
      enum: ["TYRE", "BATTERY", "BELT", "FILTER", "HOSE", "BUCKET_TOOTH", "TRACK", "OTHER"],
      required: true,
      index: true,
    },
    position: { type: String, trim: true }, // "Front-Left", "Rear-Right", "Battery-1"
    serialNumber: { type: String, trim: true },
    brand: { type: String, trim: true },
    model: { type: String, trim: true },

    // Installation
    installedOn: { type: Date, required: true },
    installedAtReading: { type: Number, default: 0 }, // HMR/KMs at fitment
    purchaseCost: { type: Number, min: 0 },
    vendorName: { type: String, trim: true },
    invoiceNumber: { type: String, trim: true },

    // Expected life (whichever exhausts first)
    expectedLifeHours: { type: Number, min: 0 },
    expectedLifeKms:   { type: Number, min: 0 },
    expectedLifeMonths:{ type: Number, min: 0 },

    // Replacement event (filled when retired)
    replacedOn: { type: Date, default: null },
    replacedAtReading: { type: Number, default: null },
    replacementReason: {
      type: String,
      enum: ["WORN_OUT", "DAMAGED", "PUNCTURE_REPAIR_FAILED", "MANUFACTURING_DEFECT", "ACCIDENT", "OTHER", null],
      default: null,
    },

    status: {
      type: String,
      enum: ["ACTIVE", "REPLACED", "REMOVED"],
      default: "ACTIVE",
      index: true,
    },
    notes: String,
  },
  { _id: true, timestamps: true }
);

const MachineryAssetSchema = new mongoose.Schema(
  {
    // --- 1. Basic Identity ---
    assetId: { type: String, required: true, unique: true, index: true }, // e.g., "EX-01"
    assetName: { type: String, required: true }, // e.g., "Hitachi Zaxis 220"
    // Free-string category — driven by AssetCategoryMaster (settings module).
    // Existing rows with legacy values ("Heavy Earthmover" etc.) remain valid.
    assetCategory: { type: String, required: true },
    // Optional link to the master record so admin-defined metadata
    // (trackingMode, requiresCompliance, requiresFuel, etc.) is reachable.
    assetCategoryRef: { type: Schema.Types.ObjectId, ref: "AssetCategoryMaster", default: null },
    assetType: { type: String, enum: ["OWN ASSET", "RENTAL ASSET"], required: true, index: true },

    vendorId: { type: String, index: true },
    vendorName: { type: String },

    // --- 2. Technical Specifications (Expanded) ---
    serialNumber: String,      // OEM Serial No
    modelNumber: String,       // e.g., "Zaxis 220 LC"
    chassisNumber: String,     // CRITICAL: Unique ID for RTO/Insurance
    engineNumber: String,      // CRITICAL: For maintenance tracking
    manufacturingYear: Number, // e.g., 2024
    fuelType: { type: String, enum: ["Diesel", "Petrol", "Electric"], default: "Diesel" },
    fuelTankCapacity: Number,  // Liters (Helps validate fuel fill-up logs)

    // --- 3. Tracking Configuration ---
    trackingMode: {
      type: String,
      enum: ["HOURS", "KILOMETERS", "UNITS"],
      default: "HOURS",
    },

    // --- 4. GPS & Telematics ---
    gps: {
      isInstalled: { type: Boolean, default: false },
      deviceId: String,        // IMEI or Device ID
      provider: String,        // e.g., "Trimble", "TrackEasy"
      lastPingDate: Date,      // Last known connectivity
      lastKnownLocation: {
        lat: Number,
        lng: Number,
        address: String,
      },
      // Geofence breach state — refreshed by fuelSync when location is known.
      lastGeofenceCheckAt: Date,
      lastGeofenceStatus: { type: String, enum: ["INSIDE", "OUTSIDE", "UNKNOWN", null], default: null },
      lastGeofenceZoneId: { type: Schema.Types.ObjectId, ref: "Geofence", default: null },
    },

    // --- 5. Current Operational Snapshot ---
    currentSite: { type: String, index: true },
    projectId: { type: String, index: true },
    currentStatus: {
      type: String,
      enum: ["Active", "Idle", "Maintenance", "Breakdown", "Scrapped"],
      default: "Active",
      index: true,
    },
    lastReading: { type: Number, default: 0 }, // Last HMR/KMs recorded
    lastReadingDate: { type: Date },
    totalFuelConsumed: { type: Number, default: 0 },

    // --- Fuel telemetry summary (auto-updated by fuelSync cron) ---
    fuelTelemetry: {
      lastSyncAt:      { type: Date },
      lastFuelReading: { type: Number },
      lastTankCapacity:{ type: Number },
      lastFuelPercent: { type: Number },
      lastStatus:      { type: String },
      lastIgnition:    { type: String },
      lastLocation:    { type: String },
      lastReadingAt:   { type: Date },
      lastError:       { type: String },
    },

    // --- 6. Compliance & Certificates ---
    compliance: {
      insurancePolicyNo: String,
      insuranceExpiry: Date,
      fitnessCertExpiry: Date,
      pollutionCertExpiry: Date,
      roadTaxExpiry: Date,
      permitExpiry: Date,
    },

    // --- 7. Documents (Digital Storage) ---
    documents: [
      {
        docType: { type: String, enum: ["Insurance", "RC", "Invoice", "Fitness", "Other"] },
        docNumber: String,
        expiryDate: Date,
        fileUrl: String,
        uploadedAt: { type: Date, default: Date.now },
      },
    ],

    // --- 8. Financials ---
    purchaseDate: Date,
    purchaseCost: Number,
    supplierName: String,
    invoiceNumber: String,

    // --- 9. Preventive-Maintenance hints (kept in sync by PM service) ---
    preventiveMaintenance: {
      lastServiceDate:       { type: Date, default: null },
      lastServiceAtReading:  { type: Number, default: null },
      nextServiceDueAt:      { type: Date, default: null },     // calendar-based next due
      nextServiceDueAtReading: { type: Number, default: null }, // meter-based next due
      activePlanCount:       { type: Number, default: 0 },
    },

    // --- 10. Wear-out sub-components (tyres, batteries, etc.) ---
    subComponents: { type: [SubComponentSchema], default: [] },

    // --- 11. Soft delete + audit ---
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },

    // Optional reverse link to the FixedAsset (finance/depreciation) record.
    // Set when the operations team and finance both register the same machine.
    fixedAssetRef: { type: Schema.Types.ObjectId, ref: "FixedAsset", default: null, index: true },
  },
  { timestamps: true }
);

// Indexes for hot dashboards
MachineryAssetSchema.index({ "compliance.insuranceExpiry": 1 });
MachineryAssetSchema.index({ "compliance.fitnessCertExpiry": 1 });
MachineryAssetSchema.index({ isDeleted: 1, currentStatus: 1 });
MachineryAssetSchema.index({ isDeleted: 1, projectId: 1 });
MachineryAssetSchema.index({ "preventiveMaintenance.nextServiceDueAt": 1 });

MachineryAssetSchema.plugin(auditPlugin, { entity_type: "MachineryAsset", entity_no_field: "assetId" });

const MachineryAsset = mongoose.model("MachineryAsset", MachineryAssetSchema);
export default MachineryAsset;
