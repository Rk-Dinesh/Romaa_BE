import mongoose from "mongoose";

// ── Company Cash Account ────────────────────────────────────────────────────
//
// Stores the company's physical cash accounts (petty cash boxes, site cash, etc.).
// Each record is linked to a leaf AccountTree entry (is_bank_cash = true)
// under parent "1010" (Cash / Petty Cash group).
//
// This mirrors CompanyBankAccount but for cash holdings.

const CompanyCashAccountSchema = new mongoose.Schema(
  {
    // ── Link to AccountTree ─────────────────────────────────────────────
    // The account_code of the corresponding AccountTree leaf.
    // E.g. "1010-PETTY-001", "1010-SITE-001"
    account_code: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    // Display name — e.g. "Head Office Petty Cash", "Site #3 Cash Box"
    account_name: {
      type: String,
      required: true,
      trim: true,
    },

    // ── Cash Details ────────────────────────────────────────────────────
    custodian_name: { type: String, default: "", trim: true },  // person responsible
    location:       { type: String, default: "", trim: true },  // head office, site office, etc.
    cash_limit:     { type: Number, default: 0 },               // max cash allowed on hand

    // ── Lifecycle ───────────────────────────────────────────────────────
    is_active:  { type: Boolean, default: true },
    is_deleted: { type: Boolean, default: false },

    created_by: { type: mongoose.Schema.Types.ObjectId, ref: "Employee" },
    updated_by: { type: mongoose.Schema.Types.ObjectId, ref: "Employee" },
  },
  { timestamps: true }
);

CompanyCashAccountSchema.index({ is_deleted: 1, is_active: 1 });

const CompanyCashAccountModel = mongoose.model("CompanyCashAccount", CompanyCashAccountSchema);
export default CompanyCashAccountModel;
