import mongoose, { Schema } from "mongoose";
import { auditPlugin } from "../../audit/auditlog.plugin.js";

const MachineDailyLogSchema = new mongoose.Schema(
  {
    assetId:  { type: Schema.Types.ObjectId, ref: "MachineryAsset", required: true, index: true },
    projectId:{ type: String, required: true, index: true },
    bid_id:   { type: Schema.Types.ObjectId, ref: "Bids", required: true, index: true },
    // vendorId is the custom business ID string (e.g. "VEN-001") — not an ObjectId,
    // since populate against a String-typed field would not resolve. Kept as a
    // denormalized lookup key.
    vendorId: { type: String, required: true, index: true },
    vendorName: { type: String, required: true, index: true },
    item_id: { type: String },
    operatorId: { type: String, default: null }, // stores employeeId string
    logDate: { type: Date, required: true, index: true }, 
    startReading: { type: Number, required: true }, 
    endReading: { type: Number, required: true },   
    netUsage: { type: Number }, 
    machineStart: Date, 
    machineStop: Date,  
    fuelOpening: Number, 
    fuelIssued: Number,   
    fuelClosing: Number, 
    fuelConsumed: { type: Number },
    length: Number,
    breadth: Number,
    depth: Number,
    unit: String,
    quantity: { type: Number, default: 0 },
    rent: Number,
    supervisorSignOff: { type: Schema.Types.ObjectId, ref: "User",default: null },
    remarks: String
  },
  { timestamps: true }
);

MachineDailyLogSchema.index({ projectId: 1, logDate: 1 });
MachineDailyLogSchema.index({ assetId: 1, logDate: -1 });

MachineDailyLogSchema.plugin(auditPlugin, { entity_type: "MachineryLog" });

const MachineDailyLog = mongoose.model("MachineDailyLog", MachineDailyLogSchema);
export default MachineDailyLog;
