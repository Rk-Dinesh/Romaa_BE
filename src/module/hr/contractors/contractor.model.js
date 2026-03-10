import mongoose from "mongoose";

const assignedProjectSchema = new mongoose.Schema(
  {
    tender_id: { type: String, required: true },
    project_name: { type: String },
    assigned_date: { type: Date, default: Date.now },
    status: {
      type: String,
      enum: ["active", "completed", "withdrawn"],
      default: "active",
    },
  },
  { _id: false }
);

const accountDetailsSchema = new mongoose.Schema(
  {
    bank_name: { type: String },
    branch_name: { type: String },
    account_number: { type: String },
    ifsc_code: { type: String },
    account_holder_name: { type: String },
    upi_id: { type: String },
    payment_terms: { type: String }, // e.g. "Net 30", "Weekly"
  },
  { _id: false }
);

const contractorSchema = new mongoose.Schema(
  {
    contractor_id: { type: String, unique: true, required: true },

    // --- Basic Info ---
    contractor_name: { type: String, required: true },
    contact_person: { type: String },
    contact_phone: { type: String },
    contact_email: { type: String },
    address: {
      street: String,
      city: String,
      state: String,
      country: String,
      pincode: String,
    },
    business_type: { type: String }, // Civil, Electrical, Plumbing
    license_number: { type: String },
    gst_number: { type: String },
    pan_number: { type: String },

    // --- Contract Period ---
    contract_start_date: { type: Date },
    contract_end_date: { type: Date },
    status: {
      type: String,
      enum: ["ACTIVE", "INACTIVE", "SUSPENDED", "BLACKLISTED"],
      default: "ACTIVE",
    },

    // --- Assigned Projects ---
    assigned_projects: { type: [assignedProjectSchema], default: [] },

    // --- Account Details for Payments ---
    account_details: { type: accountDetailsSchema, default: () => ({}) },

    // --- Employee References ---
    employees: { type: [String], default: [] }, // Array of worker_ids
    total_employees: { type: Number, default: 0 },

    remarks: { type: String },
    created_by_user: { type: String },
    wage_fixing:[{
      category:String,
      wage:Number,
    }],
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

contractorSchema.index({ isDeleted: 1, status: 1 });

const ContractorModel = mongoose.model("Contractors", contractorSchema);

export default ContractorModel;
