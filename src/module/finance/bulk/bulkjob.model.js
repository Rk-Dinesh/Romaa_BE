import mongoose from "mongoose";

const BulkJobSchema = new mongoose.Schema({
  module:       { type: String, required: true },       // "purchasebill", "journalentry", etc.
  status:       { type: String, enum: ["processing", "completed", "failed"], default: "processing" },
  total:        { type: Number, default: 0 },
  success:      { type: Number, default: 0 },
  failed:       { type: Number, default: 0 },
  errors:       [{ row: Number, message: String }],
  filename:     { type: String, default: "" },
  started_at:   { type: Date, default: Date.now },
  completed_at: { type: Date },
  initiated_by: { type: mongoose.Schema.Types.ObjectId, ref: "Employee" },
}, { timestamps: true, suppressReservedKeysWarning: true });

export default mongoose.model("BulkJob", BulkJobSchema);
