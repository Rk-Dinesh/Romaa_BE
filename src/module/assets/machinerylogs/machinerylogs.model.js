import mongoose, { Schema } from "mongoose";

const MachineDailyLogSchema = new mongoose.Schema(
  {
    assetId: { type: String, required: true, index: true, ref: 'MachineryAsset' },
    projectId: { type: String, required: true, index: true },
    bid_id: { type: String, required: true, index: true, ref: 'Bids' },
    item_id: { type: String },
    operatorId: { type: String, ref: "User",default: null },
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

const MachineDailyLog = mongoose.model("MachineDailyLog", MachineDailyLogSchema);
export default MachineDailyLog;
