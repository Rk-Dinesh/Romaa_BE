import mongoose, { Schema } from "mongoose";
import { auditPlugin } from "../../audit/auditlog.plugin.js";

const FuelTelemetryLogSchema = new mongoose.Schema(
  {
    // Asset linkage
    assetId:    { type: Schema.Types.ObjectId, ref: "MachineryAsset", required: true, index: true },
    assetCode:  { type: String, index: true },   // denormalized "EX-01" for fast queries
    plateNumber:{ type: String, index: true },   // serialNumber on MachineryAsset
    imei:       { type: String, index: true },   // gps.deviceId on MachineryAsset
    projectId:  { type: String, index: true },   // OUR project id (asset.projectId)
    externalProjectId: { type: String },         // Diztek project_id (e.g. "37")

    // Snapshot from third-party API
    fuelReading:  { type: Number },              // 58.87
    tankCapacity: { type: Number },              // 107
    unit:         { type: String, default: "ltr" },
    fuelPercent:  { type: Number },              // (reading / capacity) * 100
    ignition:     { type: String },              // "ON" | "OFF" | "--"
    status:       { type: String },              // "IDLE" | "MOVING" | ...
    location:     { type: String },
    lat:          { type: Number },
    lng:          { type: Number },

    // Timing
    readingAt:  { type: Date, required: true, index: true }, // parsed from API "datetime"
    fetchedAt:  { type: Date, default: Date.now },           // when WE pulled it

    // Derived
    deltaFromPrev: { type: Number },                          // current - previous reading
    eventType:     { type: String, enum: ["NORMAL", "REFUEL", "DRAIN"], default: "NORMAL" },

    // Provenance
    source:   { type: String, enum: ["CRON", "MANUAL", "WEBHOOK"], default: "CRON" },

    // Full original payload for debugging / re-processing
    raw: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

FuelTelemetryLogSchema.index({ assetId: 1, readingAt: -1 });
FuelTelemetryLogSchema.index({ projectId: 1, readingAt: -1 });
FuelTelemetryLogSchema.index({ eventType: 1, readingAt: -1 });

FuelTelemetryLogSchema.plugin(auditPlugin, { entity_type: "FuelTelemetryLog" });

const FuelTelemetryLog = mongoose.model("FuelTelemetryLog", FuelTelemetryLogSchema);
export default FuelTelemetryLog;
