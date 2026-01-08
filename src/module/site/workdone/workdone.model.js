import mongoose from "mongoose";

// --- Sub-Schema: Individual Line Items (The Rows) ---
const WorkItemSchema = new mongoose.Schema({
  item_description: { 
    type: String, 
    required: true, 
    trim: true 
  },
  
  dimensions: {
    length: { type: Number, default: 0 },
    breadth: { type: Number, default: 0 },
    height: { type: Number, default: 0 },
  },

  quantity: { type: Number, required: true, default: 0 },
  unit: { type: String, required: true, default: "Nos" },
  
  remarks: { type: String, default: "" },
  contractor_details: { type: String, default: "NMR" },

}, { _id: true }); // Keep _id so you can edit/delete specific rows later


// --- Main Schema: The Daily Report (The Container) ---
const WorkDoneSchema = new mongoose.Schema(
  {
    // The Readable Report ID (e.g., WD-2024-001)
    workDoneId: { 
      type: String, 
      unique: true, 
      required: true 
    },

    // "Under One Roof" - Links this report to the Tender
    tender_id: { 
      type: String, 
      required: true,
      index: true // Index this for fast retrieval of all reports for a tender
    },
    workOrder_id: { 
      type: String, 
      required: true,
      index: true // Index this for fast retrieval of all reports for a tender
    },

    report_date: { 
      type: Date, 
      required: true, 
      default: Date.now 
    },

    // The Array of Work Items
    dailyWorkDone: [WorkItemSchema],

    // Aggregates
    totalWorkDone: { type: Number, default: 0 },
    created_by: { type: String, default: "Site Engineer" },
    
    status: {
      type: String,
      enum: ["Draft", "Submitted", "Approved", "Rejected"],
      default: "Submitted"
    }
  },
  { timestamps: true }
);

const WorkDoneModel = mongoose.model("WorkDone", WorkDoneSchema);
export default WorkDoneModel;