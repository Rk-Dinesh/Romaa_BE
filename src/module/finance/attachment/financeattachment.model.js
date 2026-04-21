import mongoose from "mongoose";

// ── Finance Attachment ────────────────────────────────────────────────────────
//
// Polymorphic attachment record. Any finance voucher / document / asset can
// have one or more files attached (vendor invoice scan, bank statement PDF,
// approval email, contract, asset purchase invoice, etc.).
//
// Files live in S3 — this collection only stores metadata (key, filename,
// uploader, size, link to source document). Download URLs are generated on
// demand as 1-hour pre-signed URLs.

const FINANCE_SOURCE_TYPES = [
  "PurchaseBill", "PaymentVoucher", "ReceiptVoucher", "ExpenseVoucher",
  "JournalEntry", "CreditNote", "DebitNote", "ClientCreditNote",
  "ClientBilling", "WeeklyBilling",
  "BankTransfer", "BankReconciliation",
  "FixedAsset", "RetentionRelease",
  "Gstr2bUpload",
  "Other",
];

const ATTACHMENT_CATEGORIES = [
  "Invoice", "Receipt", "Bank Statement", "Contract", "Approval",
  "Tax Document", "Delivery Challan", "Photo", "Other",
];

const FinanceAttachmentSchema = new mongoose.Schema(
  {
    // ── What this file is attached to ───────────────────────────────────
    source_type: { type: String, enum: FINANCE_SOURCE_TYPES, required: true, index: true },
    source_ref:  { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
    source_no:   { type: String, default: "", index: true },   // human-readable e.g. "PB/25-26/0042"
    tender_id:   { type: String, default: "", index: true },

    // ── File metadata ───────────────────────────────────────────────────
    filename:     { type: String, required: true },              // original filename
    s3_key:       { type: String, required: true },              // S3 object key
    s3_bucket:    { type: String, required: true },
    file_url:     { type: String, default: "" },                 // public URL (if bucket public) — kept for backward compat
    mime_type:    { type: String, default: "" },
    size_bytes:   { type: Number, default: 0 },

    // ── Categorisation ──────────────────────────────────────────────────
    category:    { type: String, enum: ATTACHMENT_CATEGORIES, default: "Other" },
    description: { type: String, default: "" },
    tags:        { type: [String], default: [] },

    // ── Audit ───────────────────────────────────────────────────────────
    uploaded_by:   { type: String, default: "" },     // employee _id
    uploaded_by_name: { type: String, default: "" },
    uploaded_at:   { type: Date,   default: Date.now },

    // Soft delete — never physically remove (audit trail requirement)
    is_deleted:    { type: Boolean, default: false },
    deleted_by:    { type: String, default: "" },
    deleted_at:    { type: Date,   default: null },
    deleted_reason:{ type: String, default: "" },
  },
  { timestamps: true }
);

// Compound index for the common "list all files for this voucher" query
FinanceAttachmentSchema.index({ source_type: 1, source_ref: 1, is_deleted: 1 });
FinanceAttachmentSchema.index({ source_type: 1, source_no: 1, is_deleted: 1 });

const FinanceAttachmentModel = mongoose.model("FinanceAttachment", FinanceAttachmentSchema);
export default FinanceAttachmentModel;
export { FINANCE_SOURCE_TYPES, ATTACHMENT_CATEGORIES };
