import mongoose from "mongoose";

const ArchivalJobSchema = new mongoose.Schema({
  fin_year:      { type: String, required: true, unique: true }, // "24-25"
  status:        { type: String, enum: ["pending", "running", "completed", "failed"], default: "pending" },
  started_at:    { type: Date },
  completed_at:  { type: Date },
  total_records: { type: Number, default: 0 },
  archived_collections: [{
    collection_name: String,
    count: Number,
  }],
  error:         { type: String, default: "" },
  initiated_by:  { type: mongoose.Schema.Types.ObjectId, ref: "Employee" },
}, { timestamps: true });

export default mongoose.model("FinanceArchivalJob", ArchivalJobSchema);
