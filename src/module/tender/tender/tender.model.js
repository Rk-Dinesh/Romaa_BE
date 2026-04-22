import mongoose from "mongoose";
import { auditPlugin } from "../../audit/auditlog.plugin.js";

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
  { label: "Site Approach & Accessibility", key: "site_approach_accessibility" },
  { label: "Site Hurdles Identification", key: "site_hurdles_identification" },
  { label: "Labour Shed Location and Feasibility", key: "labour_shed_location_feasibility" },
  { label: "Temporary EB Connection", key: "temporary_eb_connection" },
  { label: "Water Source Identification & Connection", key: "water_source_identification_connection" },
  { label: "Office, Labour and Materials Shed Setup", key: "office_labour_materials_shed_setup" },
  { label: "Yard for Steel and Bulk Materials", key: "yard_steel_bulk_materials" },
  { label: "Office Setup & Facilities", key: "office_setup_facilities" },
  { label: "Sub Contractors Identification", key: "sub_contractors_identification" },
  { label: "Vendor Identification", key: "vendor_identification" },
];

const tenderLocationSchema = new mongoose.Schema(
  {
    city: { type: String, default: "" },
    state: { type: String, default: "" },
    country: { type: String, default: "" },
    pincode: { type: String, default: "" },
  },
  { _id: false }
);

const followUpDateSchema = new mongoose.Schema(
  {
    title: { type: String, default: "" },
    date: { type: Date, default: null },
    time: { type: String, default: "" },
    notes: { type: String, default: "" },
  },
  { _id: false }
);

const emdTrackingEntrySchema = new mongoose.Schema(
  {
    emd_note: { type: String, default: "" },
    amount_collected: { type: Number, default: 0 },
    amount_pending: { type: Number, default: 0 },
    amount_collected_by: { type: String, default: "" },
    amount_collected_date: { type: Date, default: null },
    amount_collected_time: { type: String, default: "" },
  },
  { _id: false }
);

const sdTrackingEntrySchema = new mongoose.Schema(
  {
    security_deposit_note: { type: String, default: "" },
    amount_collected: { type: Number, default: 0 },
    amount_pending: { type: Number, default: 0 },
    amount_collected_by: { type: String, default: "" },
    amount_collected_date: { type: Date, default: null },
    amount_collected_time: { type: String, default: "" },
  },
  { _id: false }
);

// Single object — NOT an array. Service always accesses [0]; now it's just the object itself.
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
    emd_deposit_pendingAmount: { type: Number, default: 0 },
    emd_approved_status: { type: String, default: "" },
    emd_applied_bank: { type: String, default: "" },
    emd_applied_bank_branch: { type: String, default: "" },
    emd_level: { type: String, default: "" },
    emd_note: { type: String, default: "" },
    emd_tracking: { type: [emdTrackingEntrySchema], default: [] },
    security_deposit_amount: { type: Number, default: 0 },
    security_deposit_validity: { type: Date, default: null },
    security_deposit_status: { type: String, default: "" },
    security_deposit_approved_by: { type: String, default: "" },
    security_deposit_approved_date: { type: Date, default: null },
    security_deposit_amount_collected: { type: Number, default: 0 },
    security_deposit_pendingAmount: { type: Number, default: 0 },
    security_deposit_note: { type: String, default: "" },
    security_deposit_tracking: { type: [sdTrackingEntrySchema], default: [] },
  },
  { _id: false }
);

const emdSchema = new mongoose.Schema(
  {
    emd_percentage: { type: Number, default: 0 },
    emd_amount: { type: Number, default: 0 },
    emd_validity: { type: Date, default: null },
    approved_emd_details: { type: approvedEmdDetailsSchema, default: () => ({}) },
  },
  { _id: false }
);

const tenderStatusCheckSchema = new mongoose.Schema(
  {
    site_investigation: { type: Boolean, default: false },
    pre_bid_meeting: { type: Boolean, default: false },
    bid_submission: { type: Boolean, default: false },
    bid_evaluation: { type: Boolean, default: false },
    technical_bid_opening: { type: Boolean, default: false },
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

// Shared schema for both tender_process and preliminary_site_work steps
const checklistStepSchema = new mongoose.Schema(
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

const financialGeneralsSchema = new mongoose.Schema(
  {
    mobilization_advance_percentage: { type: Number, default: 0 },
    mobilization_advance_amount: { type: Number, default: 0 },
    mobilization_advance_recovery_percentage: { type: Number, default: 0 },
    mobilization_advance_recovery_amount: { type: Number, default: 0 },
    retention_percentage: { type: Number, default: 0 },
    retention_amount: { type: Number, default: 0 },
    retention_release_percentage: { type: Number, default: 0 },
    retention_release_amount: { type: Number, default: 0 },
  },
  { _id: false }
);

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
    tender_business_type: { type: String, default: "" },
    tender_value: { type: Number, default: 0 },
    tender_contact_person: { type: String, default: "" },
    tender_contact_phone: { type: String, default: "" },
    tender_contact_email: { type: String, default: "" },
    tender_description: { type: String, default: "" },
    tender_location: { type: tenderLocationSchema, default: () => ({}) },
    tender_start_date: { type: Date, default: null },
    tender_end_date: { type: Date, default: null },
    tender_duration: { type: String, default: "" },
    consider_completion_duration: { type: String, default: "" },
    tender_duration_unit: { type: String, default: "" },
    workOrder_id: { type: String, default: "" },
    workOrder_issued_date: { type: Date, default: null },
    workOrder_issued_by: { type: String, default: "" },
    agreement_id: { type: String, default: "" },
    agreement_value: { type: Number, default: 0 },
    agreement_issued_date: { type: Date, default: null },
    tender_status: { type: String, default: "PENDING" },
    boq_final_value: { type: Number, default: 0 },
    zero_cost_final_value: { type: Number, default: 0 },
    penalty_final_value: { type: Number, default: 0 },

    emd: { type: emdSchema, default: () => ({}) },
    tender_status_check: { type: tenderStatusCheckSchema, default: () => ({}) },
    tender_process: {
      type: [checklistStepSchema],
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
      type: [checklistStepSchema],
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
    follow_up_dates: { type: [followUpDateSchema], default: [] },
    boq_id: { type: String, default: "" },
    created_by_user: { type: String, default: "" },
    site_location: {
      type: {
        latitude: { type: Number, default: 0 },
        longitude: { type: Number, default: 0 },
      },
      default: () => ({ latitude: 0, longitude: 0 }),
      _id: false,
    },
  },
  { timestamps: true }
);

tenderSchema.index({ tender_status: 1 });
tenderSchema.index({ client_id: 1 });
tenderSchema.index({ createdAt: -1 });

tenderSchema.plugin(auditPlugin, { entity_type: "Tender", entity_no_field: "tender_id" });

const TenderModel = mongoose.model("Tenders", tenderSchema);
export default TenderModel;
