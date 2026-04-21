import mongoose from "mongoose";

// ── Company Bank Account ──────────────────────────────────────────────────────
//
// Stores the company's own physical bank accounts (SBI Current A/c, HDFC OD, etc.).
// Each record is linked to a leaf AccountTree entry (is_bank_cash = true).
//
// This is SEPARATE from:
//   - Vendor bank details   → stored in vendor.bank_details
//   - Contractor bank details → stored in contractor.account_details
//   - Personal ledger entries (Vendor/Contractor payables) → AccountTree

const CompanyBankAccountSchema = new mongoose.Schema(
  {
    // ── Link to AccountTree ───────────────────────────────────────────────────
    // The account_code of the corresponding AccountTree leaf (is_bank_cash=true).
    // E.g. "1020-HDFC-001"
    account_code: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    // Display name — same as or more descriptive than the AccountTree account_name
    account_name: {
      type: String,
      required: true,
      trim: true,
    },

    // ── Bank Details ──────────────────────────────────────────────────────────
    bank_name:          { type: String, required: true, trim: true },   // SBI, HDFC, ICICI, etc.
    branch_name:        { type: String, default: "", trim: true },      // branch name e.g. "Anna Nagar Branch"
    account_number:     { type: String, required: true, trim: true },   // actual bank account number
    ifsc_code:          { type: String, default: "", trim: true },      // branch IFSC code
    bank_address:       { type: String, default: "" },                  // branch address
    account_holder_name:{ type: String, default: "" },                  // company/registered holder name
    account_type: {
      type: String,
      enum: ["Savings", "Current", "OD", "CC", "Fixed Deposit", ""],
      default: "",
    },

    // ── Financial limits (relevant for OD/CC accounts) ────────────────────────
    interest_pct:   { type: Number, default: 0 },   // interest % on OD/CC
    credit_limit:   { type: Number, default: 0 },   // OD/CC credit limit sanctioned
    debit_limit:    { type: Number, default: 0 },   // max daily debit allowed
    discount_limit: { type: Number, default: 0 },   // bill discounting limit

    // ── Lifecycle ─────────────────────────────────────────────────────────────
    is_active:  { type: Boolean, default: true },
    is_deleted: { type: Boolean, default: false },

    created_by: { type: mongoose.Schema.Types.ObjectId, ref: "Employee" },
    updated_by: { type: mongoose.Schema.Types.ObjectId, ref: "Employee" },
  },
  { timestamps: true }
);

CompanyBankAccountSchema.index({ is_deleted: 1, is_active: 1 });

const CompanyBankAccountModel = mongoose.model("CompanyBankAccount", CompanyBankAccountSchema);
export default CompanyBankAccountModel;
