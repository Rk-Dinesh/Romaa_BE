import mongoose from "mongoose";

const { Schema } = mongoose;

// Single line inside "lines" array
const LineSchema = new Schema(
  {
    category: {
      type: String,
      enum: [ "MY-M", "MY-F", "MP-C", "MP-NMR", "MT-CM", "MT-BL"],
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
    itemNo: { type: String, required: true ,index:true},
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
    tender_id: { type: String, required: true },
    work_items: { type: [WorkItemSchema], default: [] },
  },
  { timestamps: true }
);

const WorkItemModel = mongoose.model("WorkItems", MainSchema);

export default WorkItemModel;
