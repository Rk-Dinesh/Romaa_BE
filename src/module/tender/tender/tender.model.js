import mongoose from "mongoose";

// ✅ Sub-schema for tender location
const tenderLocationSchema = new mongoose.Schema(
  {
    city: { type: String, default: "" },
    state: { type: String, default: "" },
    country: { type: String, default: "" },
    pincode: { type: String, default: "" }
  },
  { _id: false }
);

// ✅ Sub-schema for approved EMD details
const approvedEmdDetailsSchema = new mongoose.Schema(
  {
    emd_proposed_company: { type: String, default: "" },
    emd_proposed_amount: { type: Number, default: 0 },
    emd_proposed_date: { type: Date, default: null },
    emd_approved: { type: Boolean, default: false },
    emd_approved_date: { type: Date, default: null },
    emd_approved_by: { type: String, default: "" },
    emd_approved_amount: { type: Number, default: 0 },
    emd_approved_status: { type: String, default: "" },
    emd_applied_bank: { type: String, default: "" },
    emd_applied_bank_branch: { type: String, default: "" },
    emd_level: { type: String, default: "" },
    emd_note: { type: String, default: "" },
    security_deposit_amount: { type: Number, default: 0 },
    security_deposit_validity: { type: Date, default: null },
    security_deposit_status: { type: String, default: "" },
    security_deposit_approved_by: { type: String, default: "" },
    security_deposit_approved_date: { type: Date, default: null },
    security_deposit_amount_collected: { type: Number, default: 0 },
    security_deposit_pendingAmount: {
      type: Number,
      default: 0 // will be calculated in service
    },
    security_deposit_note: { type: String, default: "" }
  },
  { _id: false }
);

// ✅ Sub-schema for EMD
const emdSchema = new mongoose.Schema(
  {
    emd_percentage: { type: Number, default: 0 },
    emd_amount: { type: Number, default: 0 }, // calculated in service
    emd_validity: { type: Date, default: null },
    approved_emd_details: { type: [approvedEmdDetailsSchema], default: [] }
  },
  { _id: false }
);

// ✅ Sub-schema for Security Deposit
const securityDepositSchema = new mongoose.Schema(
  {
    security_deposit_percentage: { type: Number, default: 0 },
    security_deposit_amount: { type: Number, default: 0 }, // calculated in service
    security_deposit_validity: { type: Date, default: null }
  },
  { _id: false }
);

// ✅ Sub-schema for tender status check
const tenderStatusCheckSchema = new mongoose.Schema(
  {
    site_investigation: { type: Boolean, default: false },
    pre_bid_meeting: { type: Boolean, default: false },
    bid_submission: { type: Boolean, default: false },
    bid_evaluation: { type: Boolean, default: false },
    techincal_bid_opening: { type: Boolean, default: false },
    commercial_bid_opening: { type: Boolean, default: false },
    negotiation: { type: Boolean, default: false },
    work_order_issued: { type: Boolean, default: false },
    work_agreement_signed: { type: Boolean, default: false },
    project_commencement: { type: Boolean, default: false },
    project_completion: { type: Boolean, default: false },
    payment_received: { type: Boolean, default: false }
  },
  { _id: false }
);

// ✅ Main schema
const tenderSchema = new mongoose.Schema(
  {
    tender_id: { type: String, required: true, unique: true },
    tender_name: { type: String, required: true },
    client_id: { type: String, default: "" },
    client_name: { type: String, default: "" },
    tender_type: { type: String, default: "" },
    tender_value: { type: Number, default: 0 },
    tender_contact_person: { type: String, default: "" },
    tender_contact_phone: { type: String, default: "" },
    tender_contact_email: { type: String, default: "" },
    tender_description: { type: String, default: "" },
    tender_location: { type: tenderLocationSchema, default: () => ({}) },
    tender_start_date: { type: Date, default: null },
    tender_end_date: { type: Date, default: null },
    workOrder_id: { type: String, default: "" },
    workOrder_issued_date: { type: Date, default: null },
    workOrder_issued_by: { type: String, default: "" },
    tender_status: { type: String, default: "OPEN" },

    boq_final_value: { type: Number, default: 0 },
    zeroCost_final_value: { type: Number, default: 0 },
    penalty_final_value: { type: Number, default: 0 },

    emd: { type: emdSchema, default: () => ({}) },

    security_deposit: { type: securityDepositSchema, default: () => ({}) },

    tender_status_check: {
      type: tenderStatusCheckSchema,
      default: () => ({})
    },

    project_documents_ids: { type: [String], default: [] },
    tender_plan_documents_ids: { type: [String], default: [] },
    contractor_details: { type: [String], default: [] },
    vendor_details: { type: [String], default: [] },
    follow_up_ids: { type: [String], default: [] },
    BoQ_id: { type: String, default: "" },
    created_by_user: { type: String, default: "" }
  },
  { timestamps: true }
);

const TenderModel = mongoose.model("Tenders", tenderSchema);
export default TenderModel;
