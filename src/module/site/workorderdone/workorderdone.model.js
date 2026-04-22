import mongoose from "mongoose";
import { auditPlugin } from "../../audit/auditlog.plugin.js";

// --- Sub-Schema: Individual Line Items (The Rows) ---
const WorkItemSchema = new mongoose.Schema(
  {
    item_description: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
    },
    dimensions: {
      no1: { type: Number, default: 0 },
      no2: { type: Number, default: 0 },
      length: { type: Number, default: 0 },
      breadth: { type: Number, default: 0 },
      height: { type: Number, default: 0 },
    },

    quantity: { type: Number, required: true, default: 0 },
    quoted_rate: { type: Number, default: 0 },
    unit: { type: String, required: true, default: "Nos" },

    remarks: { type: String, default: "No Remarks" },
    contractor_details: { type: String, default: "NMR" },
  },
  { _id: true },
); // Keep _id so you can edit/delete specific rows later

// --- Main Schema: The Daily Report (The Container) ---
const WorkOrderDoneSchema = new mongoose.Schema(
  {
    // The Readable Report ID (e.g., WD-2024-001)
    workDoneId: {
      type: String,
      unique: true,
      required: true,
    },

    // "Under One Roof" - Links this report to the Tender
    tender_id: {
      type: String,
      required: true,
      index: true, // Index this for fast retrieval of all reports for a tender
    },
    workOrder_id: {
      type: String,
      required: true,
      index: true, // Index this for fast retrieval of all reports for a tender
    },
    contractor_name: {
      type: String,
    },
    report_date: {
      type: Date,
      required: true,
      default: Date.now,
    },

    // The Array of Work Items
    dailyWorkDone: [WorkItemSchema],

    // Aggregates
    totalWorkDone: { type: Number, default: 0 },
    created_by: { type: String, default: "Site Engineer" },

    status: {
      type: String,
      enum: ["Draft", "Submitted", "Approved", "Rejected"],
      default: "Submitted",
    },
    is_bill_generated: {
      type: Boolean,
      default: false,
    },
    is_sub_bill_generated: {
      type: Boolean,
      default: false,
    },
   bill_no: {
    type: String,
    default: "",
   },
   sub_bill_no: {
    type: String,
    default: "",
   },

  },
  { timestamps: true },
);

WorkOrderDoneSchema.plugin(auditPlugin, { entity_type: "WorkOrderDone", entity_no_field: "workDoneId" });

const WorkOrderDoneModel = mongoose.model("WorkOrderDone", WorkOrderDoneSchema);
export default WorkOrderDoneModel;
