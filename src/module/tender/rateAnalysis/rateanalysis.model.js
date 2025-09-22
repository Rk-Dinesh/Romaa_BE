import mongoose from "mongoose";

const RateLineSchema = new mongoose.Schema({
  category: {
    type: String,
    enum: ['MAIN_ITEM', 'MACHINERIES', 'MATERIALS', 'FUEL', 'SUBCONTRACTOR', 'MANPOWER', 'MAIN'],
    required: true,
  },
  subCategory: {
    type: String, // e.g. “Equipment”, “Material”, “S/C Work”
  },
  description: {
    type: String,
    required: true,
  },
  unit: {
    type: String, // e.g. “Cum”, “Month”, “Lit”, etc.
  },
  quantity: {
    type: Number,
  },
  output: {
    type: Number, // output quantity (only MAIN_ITEM rows)
  },
  rate: {
    type: Number, // unit rate
  },
  amount: {
    type: Number, // total amount
  },
  finalRate: {
    type: Number, // per‐unit final rate
  },
}, { _id: false });

const WorkItemSchema = new mongoose.Schema({
  itemNo: {
    type: Number,
    required: true,
    index: true,
  },
  workItem: {
    type: String,
    required: true, // e.g. “Earthwork”
  },
  lines: {
    type: [RateLineSchema],
    default: [],
  },
}, {
  timestamps: true,
});

const WorkItemModel = mongoose.model("WorkItems", WorkItemSchema);

export default WorkItemModel;
