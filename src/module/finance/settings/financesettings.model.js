import mongoose from "mongoose";

const FinanceSettingsSchema = new mongoose.Schema({
  key:         { type: String, required: true, unique: true },
  value:       { type: mongoose.Schema.Types.Mixed, required: true },
  description: { type: String, default: "" },
  updated_by:  { type: mongoose.Schema.Types.ObjectId, ref: "Employee" },
}, { timestamps: true });

export default mongoose.model("FinanceSettings", FinanceSettingsSchema);
