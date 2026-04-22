import mongoose from "mongoose";
import { auditPlugin } from "../../audit/auditlog.plugin.js";

const penaltySchema = new mongoose.Schema({
  penalty_id: String,
  tender_id: String, // optional, to associate with a specific tender
  penalty_type: String, // e.g., "late delivery", "non-compliance"
  penalty_amount: Number,
  penalty_date: Date,
  description: String,
  status: String, // e.g., "pending", "paid", "waived"
});

const PenaltySchema = new mongoose.Schema({
  tender_id: String,
  listOfPenalties: [penaltySchema],
});

PenaltySchema.plugin(auditPlugin, { entity_type: "Penalty" });

const PenaltyModel = mongoose.model("Penalty", PenaltySchema);

export default PenaltyModel;
