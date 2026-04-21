import mongoose from "mongoose";

const TRANSFER_MODES = ["NEFT", "RTGS", "IMPS", "UPI", "Cheque", "Cash", "Internal"];

const BankTransferSchema = new mongoose.Schema(
  {
    // Auto-generated: BT/<FY>/<seq>  e.g. BT/25-26/0001
    transfer_no: { type: String, unique: true },

    transfer_date:  { type: Date, default: null },
    document_year:  { type: String, default: "" },  // e.g. "25-26"

    // ── Source (money leaves this account) ───────────────────────────────
    from_account_code: { type: String, required: true, trim: true },
    from_account_name: { type: String, default: "" },

    // ── Destination (money enters this account) ─────────────────────────
    to_account_code:   { type: String, required: true, trim: true },
    to_account_name:   { type: String, default: "" },

    // ── Transfer details ────────────────────────────────────────────────
    amount:        { type: Number, required: true },
    transfer_mode: { type: String, enum: TRANSFER_MODES, default: "NEFT" },
    reference_no:  { type: String, default: "" },  // UTR / NEFT / RTGS ref
    cheque_no:     { type: String, default: "" },
    cheque_date:   { type: Date,   default: null },

    // ── Tender (optional — for project-wise tracking) ───────────────────
    tender_id:   { type: String, default: "" },
    tender_name: { type: String, default: "" },

    narration: { type: String, default: "" },

    // ── Linked JournalEntry (created on approval) ───────────────────────
    je_ref: { type: mongoose.Schema.Types.ObjectId, ref: "JournalEntry", default: null },
    je_no:  { type: String, default: "" },

    // ── Lifecycle ───────────────────────────────────────────────────────
    status: {
      type: String,
      enum: ["draft", "pending", "approved"],
      default: "pending",
    },

    created_by:  { type: mongoose.Schema.Types.ObjectId, ref: "Employee" },
    updated_by:  { type: mongoose.Schema.Types.ObjectId, ref: "Employee" },
    approved_by: { type: mongoose.Schema.Types.ObjectId, ref: "Employee", default: null },
    approved_at: { type: Date, default: null },
    is_deleted:  { type: Boolean, default: false },
  },
  { timestamps: true }
);

BankTransferSchema.index({ status: 1, transfer_date: -1 });
BankTransferSchema.index({ from_account_code: 1, transfer_date: -1 });
BankTransferSchema.index({ to_account_code: 1, transfer_date: -1 });

const BankTransferModel = mongoose.model("BankTransfer", BankTransferSchema);
export default BankTransferModel;
