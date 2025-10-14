import mongoose from "mongoose";

const WorkDetailSchema = new mongoose.Schema({
  description: { type: String, required: true }, // Description of work
  unit: { type: String, required: true },
  qty: { type: Number, required: true },
  executedQty: { type: Number, default: 0 },
  balanceQty: { type: Number, default: 0 },
  startDate: { type: Date },
  endDate: { type: Date },
  duration: { type: Number },
  delay: { type: Number, default: 0 },
  status: { type: String, enum: ['pending','in-progress','completed'], default: 'pending' },
  daysRemaining: { type: Number },
  notes: { type: String }
}, { _id: false });

// Sub-subheading schema
const SubWorkSchema = new mongoose.Schema({
  subworkName: { type: String, required: true },
  Unit: { type: String, required: true },
  total_Qty: { type: Number, required: true },
  startDate: { type: Date },
    endDate: { type: Date },
  workDetails: [WorkDetailSchema] // Multiple work items under this heading
}, { _id: false });

// Subheading schema
const customWorkSchema = new mongoose.Schema({
  customworks: { type: String, required: true },
  subworks: [SubWorkSchema] // Multiple sub-subheadings beneath this
}, { _id: false });

// Major heading schema
const MajorHeadingSchema = new mongoose.Schema({
  majorHeadingName: { type: String, required: true },
  subheadings: [customWorkSchema]
}, { _id: false });

// Main schema for the whole project
const scheduleSchema = new mongoose.Schema({
  workOrderDate: { type: Date, required: true },
  aggDate: { type: Date },
  agreementValue: { type: Number, required: true },
  projectEndDate: { type: Date, required: true },
  plannedCompletionDate: { type: Date },
  reportDate: { type: Date },
  projectName: { type: String, required: true },
  tenderId: { type: String, required: true },
  majorHeadings: [MajorHeadingSchema], // A, B, C group, each with nested hierarchy
  notes: { type: String }
}, { timestamps: true });

const ScheduleModel = mongoose.model("Schedule", scheduleSchema);

export default ScheduleModel;
