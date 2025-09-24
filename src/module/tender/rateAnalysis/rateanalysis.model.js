import mongoose from "mongoose";

// Line schema for individual line items grouped by category
const LineSchema = new mongoose.Schema({
  description: { type: String, required: true },
  unit: { type: String, default: "" },
  quantity: { type: Number, default: null },
  output: { type: Number, default: null },
  rate: { type: Number, default: null },
  amount: { type: Number, default: null },
  finalRate: { type: Number, default: null }
}, { _id: false });

const LinesByCategorySchema = new mongoose.Schema({
  category: {
    type: String,
    enum: ['MAIN_ITEM', 'MACHINERIES', 'MATERIALS', 'FUEL', 'SUBCONTRACTOR', 'MANPOWER', 'MAIN'],
    required: true
  },
  sub: {
    type: [LineSchema],
    default: []
  }
}, { _id: false });

const WorkItemSchema = new mongoose.Schema({
  itemNo: { type: Number, required: true, index: true },
  workItem: { type: String, required: true },
  unit: { type: String, default: null },
  output: { type: Number, default: null },
  finalRate: { type: Number, default: null },
  lines: { type: [LinesByCategorySchema], default: [] },
}, { _id: false });

const MainSchema = new mongoose.Schema({
  tender_id: { type: String, required: true },
  work_items: { type: [WorkItemSchema], default: [] }
}, { timestamps: true });

const WorkItemModel = mongoose.model("WorkItems", MainSchema);

export default WorkItemModel;
