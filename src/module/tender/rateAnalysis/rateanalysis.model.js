import mongoose from "mongoose";

const { Schema } = mongoose;

// Single line inside "lines" array
const LineSchema = new Schema(
  {
    category: {
      type: String,
      enum: ["MY-M", "MY-F", "MP-C", "MP-NMR", "MT-CM", "MT-BL"],
      required: true,
    },
    description: { type: String, required: true },
    unit: { type: String, default: "" },
    quantity: { type: Number, default: null },
    rate: { type: Number, default: null },
    amount: { type: Number, default: null },
    total_rate: { type: Number, default: null },
  },
  { _id: false } 
);
// Work item schema
const WorkItemSchema = new Schema(
  {
    itemNo: { type: String, required: true, index: true },
    workItem: { type: String, required: true },
    unit: { type: String, default: null },

    // from JSON
    working_quantity: { type: Number, default: null },
    category: {
      type: String,
      enum: ["MAIN_ITEM"],
      default: "MAIN_ITEM",
    },
    MT_CM_rate: { type: Number, default: 0 },
    MT_BL_rate: { type: Number, default: 0 },
    MY_M_rate: { type: Number, default: 0 },
    MY_F_rate: { type: Number, default: 0 },
    MP_C_rate: { type: Number, default: 0 },
    MP_NMR_rate: { type: Number, default: 0 },
    final_rate: { type: Number, default: 0 },

    lines: { type: [LineSchema], default: [] },
  },
  { _id: false }
);

// Root schema
const MainSchema = new Schema(
  {
    tender_id: { type: String, required: true, unique: true }, // Explicitly defined as String
    work_items: { type: [WorkItemSchema], default: [] },
    summary: {
      zero_cost_total_amount: { type: Number, default: 0 },
      siteoverhead_total_amount: { type: Number, default: 0 },
      total_cost: { type: Number, default: 0 },
      boq_total_amount: { type: Number, default: 0 },
      margin: { type: Number, default: 0 },
      escalation_benefits_percentage: { type: Number, default: 0 },
      total_margin: { type: Number, default: 0 },
      risk_contingency: { type: Number, default: 0 },
      grossmargin_percentage: { type: Number, default: 0 },
      ho_overheads: { type: Number, default: 0 },
      PBT: { type: Number, default: 0 },
    },
    freeze: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const WorkItemModel = mongoose.model("WorkItems", MainSchema);

export default WorkItemModel;

// Calculate summary values
// zero_cost_total_amount 
// siteoverhead_total_amount = updated value of  grand_total_overheads_rs
// total_cost = zero_cost_total_amount + siteoverhead_total_amount
// boq_total_amount = take from boq
// margin = total_cost - boq_total_amount
// escalation_benefits_percentage = if 1 or 2 etc
// total_margin = margin + (margin * escalation_benefits_percentage / 100)
// grossmargin_percentage = total_margin * 100 / boq_total_amount
// risk_contingency = 1 0r 2
// ho_overheads =1 or 2 or 0
// PBT = grossmargin_percentage - risk_contingency - ho_overheads
