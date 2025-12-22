import mongoose from "mongoose";

const tenderProcessDataTemplate = [
  { label: "Site Investigation", key: "site_investigation" },
  { label: "Pre bid Meeting", key: "pre_bid_meeting" },
  { label: "Bid Submit", key: "bid_submission" },
  { label: "Technical Bid Opening", key: "technical_bid_opening" },
  { label: "Commercial Bid Opening", key: "commercial_bid_opening" },
  { label: "Negotiations", key: "negotiation" },
  { label: "Work Order", key: "work_order" },
  { label: "Agreement", key: "agreement" },
];

const preliminarySiteWorkTemplate = [
  { label: "Site Visit & Reconnaissance", key: "site_visit_reconnaissance" },
  {
    label: "Site Approach & Accessibility",
    key: "site_approach_accessibility",
  },
  { label: "Site Hurdles Identification", key: "site_hurdles_identification" },
  {
    label: "Labour Shed Location and Feasibility",
    key: "labour_shed_location_feasibility",
  },
  { label: "Temporary EB Connection", key: "temporary_eb_connection" },
  {
    label: "Water Source Identification & Connection",
    key: "water_source_identification_connection",
  },
  {
    label: "Office, Labour and Materials Shed Setup",
    key: "office_labour_materials_shed_setup",
  },
  {
    label: "Yard for Steel and Bulk Materials",
    key: "yard_steel_bulk_materials",
  },
  { label: "Office Setup & Facilities", key: "office_setup_facilities" },
  {
    label: "Sub Contractors Identification",
    key: "sub_contractors_identification",
  },
  { label: "Vendor Identification", key: "vendor_identification" },
];

// ✅ Sub-schema for tender location
const tenderLocationSchema = new mongoose.Schema(
  {
    city: { type: String, default: "" },
    state: { type: String, default: "" },
    country: { type: String, default: "" },
    pincode: { type: String, default: "" },
  },
  { _id: false }
);

// ✅ Sub-schema for an important date item
const followUpDateSchema = new mongoose.Schema(
  {
    title: { type: String, default: "" }, // e.g., Last Date of Document Purchase
    date: { type: Date, default: null }, // e.g., 2025-06-12
    time: { type: String, default: "" }, // e.g., "12:00 PM"
    notes: { type: String, default: "" }, // e.g., "123 Street, Chennai"
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
    emd_deposit_amount_collected: { type: Number, default: 0 },
    emd_deposit_pendingAmount: {
      type: Number,
      default: 0,
    },
    emd_approved_status: { type: String, default: "" },
    emd_applied_bank: { type: String, default: "" },
    emd_applied_bank_branch: { type: String, default: "" },
    emd_level: { type: String, default: "" },
   
    emd_tracking: [
      {
         emd_note: { type: String, default: "" },
         amount_collected: { type: Number, default: 0 },
         amount_pending: { type: Number, default: 0 },
         amount_collected_by: { type: String, default: "" },
         amount_collected_date: { type: Date, default: null },
         amount_collected_time: { type: String, default: "" },
      }
    ],
    security_deposit_amount: { type: Number, default: 0 },
    security_deposit_validity: { type: Date, default: null },
    security_deposit_status: { type: String, default: "" },
    security_deposit_approved_by: { type: String, default: "" },
    security_deposit_approved_date: { type: Date, default: null },
    security_deposit_amount_collected: { type: Number, default: 0 },
    security_deposit_pendingAmount: {
      type: Number,
      default: 0, // will be calculated in service
    },
    security_deposit_note: { type: String, default: "" },
    security_deposit_tracking: [
      {
         security_deposit_note: { type: String, default: "" },
         amount_collected: { type: Number, default: 0 },
         amount_pending: { type: Number, default: 0 },
         amount_collected_by: { type: String, default: "" },
         amount_collected_date: { type: Date, default: null },
         amount_collected_time: { type: String, default: "" },
      }
    ],
  },
  { _id: false }
);

// ✅ Sub-schema for EMD
const emdSchema = new mongoose.Schema(
  {
    emd_percentage: { type: Number, default: 0 },
    emd_amount: { type: Number, default: 0 }, // calculated in service
    emd_validity: { type: Date, default: null },
    approved_emd_details: { type: [approvedEmdDetailsSchema], default: [] },
  },
  { _id: false }
);

// ✅ Sub-schema for Security Deposit
const securityDepositSchema = new mongoose.Schema(
  {
    security_deposit_percentage: { type: Number, default: 0 },
    security_deposit_amount: { type: Number, default: 0 }, // calculated in service
    security_deposit_validity: { type: Date, default: null },
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
    payment_received: { type: Boolean, default: false },
  },
  { _id: false }
);

const tenderProcessStepSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    label: { type: String, required: true },
    notes: { type: String, default: "" },
    date: { type: Date, default: null },
    time: { type: String, default: "" },
    file_name: { type: String, default: "" },
    file_url: { type: String, default: "" },
    completed: { type: Boolean, default: false },
  },
  { _id: false }
);

const preliminarySiteWorkSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    label: { type: String, required: true },
    notes: { type: String, default: "" },
    date: { type: Date, default: null },
    time: { type: String, default: "" },
    file_name: { type: String, default: "" },
    file_url: { type: String, default: "" },
    completed: { type: Boolean, default: false },
  },
  { _id: false }
);

const financialGeneralsSchema = new mongoose.Schema({
  mobilization_advance_percentage: { type: Number, default: 0 },
  mobilization_advance_amount: { type: Number, default: 0 }, // calculated
  mobilization_advance_recovery_percentage: { type: Number, default: 0 },
  mobilization_advance_recovery_amount: { type: Number, default: 0 }, // calculated
  retention_percentage: { type: Number, default: 0 },
  retention_amount: { type: Number, default: 0 }, // calculated
  retention_release_percentage: { type: Number, default: 0 },
  retention_release_amount: { type: Number, default: 0 }, // calculated
}, { _id: false})

// ✅ Main schema
const tenderSchema = new mongoose.Schema(
  {
    tender_id: { type: String, required: true, unique: true },
    tender_name: { type: String, required: true },
    tender_project_name: { type: String, default: "" },
    client_id: { type: String, default: "" },
    client_name: { type: String, default: "" },
    tender_type: { type: String, default: "" },
    tender_project_division: { type: String, default: "" },
    tender_project_type: { type: String, default: "" },
    tender_bussiness_type: { type: String, default: "" }, // no need to show in frontend
    tender_value: { type: Number, default: 0 },
    tender_contact_person: { type: String, default: "" },
    tender_contact_phone: { type: String, default: "" },
    tender_contact_email: { type: String, default: "" },
    tender_description: { type: String, default: "" },
    tender_location: { type: tenderLocationSchema, default: () => ({}) },
    tender_start_date: { type: Date, default: null },
    tender_end_date: { type: Date, default: null },
    tender_duration: { type: String, default: "" },
    tender_duration_unit: { type: String, default: "" },
    workOrder_id: { type: String, default: "" },
    workOrder_issued_date: { type: Date, default: null },
    agreement_id: { type: String, default: "" },
    agreement_value: { type: Number, default: 0 },
    agreement_issued_date: { type: Date, default: null },
    workOrder_issued_by: { type: String, default: "" },
    tender_status: { type: String, default: "PENDING" },
    boq_final_value: { type: Number, default: 0 },
    zeroCost_final_value: { type: Number, default: 0 },
    penalty_final_value: { type: Number, default: 0 },

    emd: { type: emdSchema, default: () => ({}) },
    security_deposit: { type: securityDepositSchema, default: () => ({}) },
    tender_status_check: {
      type: tenderStatusCheckSchema,
      default: () => ({}),
    },
    tender_process: {
      type: [tenderProcessStepSchema],
      default: () =>
        tenderProcessDataTemplate.map((step) => ({
          key: step.key,
          label: step.label,
          notes: "",
          date: null,
          time: "",
          file_name: "",
          completed: false,
        })),
    },
    preliminary_site_work: {
      type: [preliminarySiteWorkSchema],
      default: () =>
        preliminarySiteWorkTemplate.map((step) => ({
          key: step.key,
          label: step.label,
          notes: "",
          date: null,
          time: "",
          file_name: "",
          completed: false,
        })),
    },
    financial_generals: { type: financialGeneralsSchema, default: () => ({}) },
    project_documents_ids: { type: [String], default: [] },
    tender_plan_documents_ids: { type: [String], default: [] },
    contractor_details: { type: [String], default: [] },
    vendor_details: { type: [String], default: [] },
    follow_up_ids: { type: [followUpDateSchema], default: [] },
    BoQ_id: { type: String, default: "" },
    created_by_user: { type: String, default: "" },
  },
  { timestamps: true }
);

const TenderModel = mongoose.model("Tenders", tenderSchema);
export default TenderModel;
