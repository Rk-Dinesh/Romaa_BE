import mongoose from "mongoose";

// ── Account Tree / Chart of Accounts ─────────────────────────────────────────
//
// The Account Tree is the master list of all financial accounts in the General
// Ledger. Every financial transaction is recorded against at least two accounts
// (double-entry). This model defines the full hierarchy:
//
//   ASSETS (Group)
//     └─ Current Assets (Group)
//         └─ Cash / Petty Cash           ← leaf — transactions posted here
//         └─ Bank Accounts (Group)
//             └─ HDFC Current A/c        ← leaf
//
// RULES:
//   is_group = true  → summary/parent node; NO transactions posted here
//   is_group = false → leaf node (ledger account); transactions CAN be posted
//
// Every voucher entry (EntryLineSchema in PurchaseBill, CreditNote, etc.) should
// reference an account_code from this collection.

// ── Enums ─────────────────────────────────────────────────────────────────────

// The 5 fundamental account types in double-entry bookkeeping
const ACCOUNT_TYPES = [
  "Asset",     // Things the company OWNS — Dr normal balance
  "Liability", // Things the company OWES — Cr normal balance
  "Equity",    // Owner's stake           — Cr normal balance
  "Income",    // Revenue earned          — Cr normal balance
  "Expense",   // Costs incurred          — Dr normal balance
];

// Sub-categories for richer filtering and grouping in reports
const ACCOUNT_SUBTYPES = [
  // Asset subtypes
  "Current Asset",    // Cash, bank, receivables, advances, inventory
  "Fixed Asset",      // Machinery, equipment, buildings
  "Contra Asset",     // Accumulated depreciation (offsets a fixed asset)
  // Liability subtypes
  "Current Liability", // Payables, advances from clients, short-term dues
  "Tax Liability",     // GST payable, TDS payable
  "Long-term Liability",
  // Equity subtypes
  "Capital",           // Owner capital, share capital
  "Reserves",          // Retained earnings, statutory reserves
  // Income subtypes
  "Operating Income",  // Project/contract revenue
  "Other Income",      // Interest, penalties recovered, misc
  // Expense subtypes
  "Direct Cost",       // Material, labour, subcontract — project-specific
  "Site Overhead",     // Transportation, plant hire, fuel, site facilities
  "Admin Expense",     // Office staff, rent, telecom, insurance
  "Financial Expense", // Interest paid, bank charges, professional fees
  "Depreciation",      // Depreciation on assets
  // Misc
  "Other",
];

// GST / TDS account tagging — for compliance reports
const TAX_TYPES = [
  "None",
  "CGST_Input",   // ITC received on inward supply (within state)
  "SGST_Input",   // ITC received on inward supply (within state)
  "IGST_Input",   // ITC received on inter-state inward supply
  "CGST_Output",  // GST collected on client billing (within state)
  "SGST_Output",  // GST collected on client billing (within state)
  "IGST_Output",  // GST collected on inter-state billing
  "CGST_RCM",     // CGST payable under Reverse Charge Mechanism (inward, you pay to govt)
  "SGST_RCM",     // SGST payable under Reverse Charge Mechanism (inward, you pay to govt)
  "IGST_RCM",     // IGST payable under Reverse Charge Mechanism (inter-state, you pay to govt)
  "TDS",          // Tax Deducted at Source (Section 194C, 194J, etc.)
  "ITC_Reversal", // When input credit is reversed (returns, exempts)
];

const SUPPLIER_TYPES = ["Vendor", "Contractor", "Client"];

// ── Main schema ───────────────────────────────────────────────────────────────

const AccountTreeSchema = new mongoose.Schema(
  {
    // ── Identity ──────────────────────────────────────────────────────────
    // Unique business key. Convention:
    //   Group roots:     "1000", "2000", "3000", "4000", "5000"
    //   Subgroups:       "1001" (Current Assets), "2100" (Tax Liabilities)
    //   Standard leaves: "1010" (Cash), "2110" (CGST Payable)
    //   Personal leaves: "2010-VND-001" (Vendor ABC payable)
    account_code: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    account_name: {
      type: String,
      required: true,
      trim: true,
    },

    // Short note shown in dropdowns / tooltips
    description: { type: String, default: "" },

    // ── Account classification ────────────────────────────────────────────
    account_type:    { type: String, enum: ACCOUNT_TYPES,    required: true },
    account_subtype: { type: String, enum: ACCOUNT_SUBTYPES, default: "Other" },

    // The natural balance side for this account type:
    //   Dr — Assets, Expenses
    //   Cr — Liabilities, Equity, Income
    normal_balance: { type: String, enum: ["Dr", "Cr"], required: true },

    // ── Tree structure ────────────────────────────────────────────────────
    // null parent_code = root node
    parent_code: { type: String, default: null },

    // Depth in tree: 0 = root type header, 1 = sub-group, 2 = standard leaf, 3 = personal leaf
    level: { type: Number, default: 0 },

    // ── Group vs Ledger distinction ───────────────────────────────────────
    // Group accounts: is_group = true  → parent/summary, NO direct postings
    // Ledger accounts: is_group = false → leaf, transactions ARE posted here
    is_group: { type: Boolean, default: false },

    // ── Posting permission ────────────────────────────────────────────────
    // false for group accounts or temporarily locked accounts
    is_posting_account: { type: Boolean, default: true },

    // ── Bank / Cash flag ─────────────────────────────────────────────────
    // true for accounts that represent actual bank or cash holdings
    // Used to populate the "paying bank" dropdown in Payment Voucher
    is_bank_cash: { type: Boolean, default: false },

    // ── Personal ledger (Vendor / Contractor / Client) ────────────────────
    // Vendor and Contractor payable accounts are personal ledgers — one per party.
    // Auto-created when a new Vendor/Contractor is added to the system.
    is_personal: { type: Boolean, default: false },

    linked_supplier_id:   { type: String, default: null },   // VND-001, CTR-012, CLI-001
    linked_supplier_type: { type: String, enum: [...SUPPLIER_TYPES, null], default: null },
    linked_supplier_ref:  { type: mongoose.Schema.Types.ObjectId, default: null },

    // ── Tax / compliance tagging ──────────────────────────────────────────
    // Marks which accounts feed into GST and TDS compliance reports
    tax_type: { type: String, enum: TAX_TYPES, default: "None" },

    // ── System account flag ───────────────────────────────────────────────
    // System accounts are seeded automatically and cannot be deleted/renamed.
    // Custom accounts created by users have is_system = false.
    is_system: { type: Boolean, default: false },

    // ── Lifecycle ─────────────────────────────────────────────────────────
    is_active:  { type: Boolean, default: true },
    is_deleted: { type: Boolean, default: false },

    // ── Opening balance (migration from prior system) ─────────────────────
    // Used to set the starting balance when migrating from manual books.
    // Not used for ongoing transactions — those go through vouchers.
    opening_balance:      { type: Number, default: 0 },
    opening_balance_type: { type: String, enum: ["Dr", "Cr", ""], default: "" },
    opening_balance_date: { type: Date, default: null },

    // ── Bank details (only for is_bank_cash = true accounts) ─────────────
    // Stores the physical bank account information for bank ledger accounts.
    // e.g., SBI Current A/c, HDFC OD account, etc.
    bank_details: {
      bank_name:      { type: String, default: "" },   // SBI, HDFC, ICICI, etc.
      account_no:     { type: String, default: "" },   // actual bank account number
      ifsc_code:      { type: String, default: "" },   // branch IFSC
      bank_address:   { type: String, default: "" },   // branch address
      account_type:   {
        type: String,
        enum: ["Savings", "Current", "OD", "CC", "Fixed Deposit", ""],
        default: "",
      },
      interest_pct:   { type: Number, default: 0 },    // interest % on OD/CC accounts
      credit_limit:   { type: Number, default: 0 },    // OD/CC credit limit sanctioned
      debit_limit:    { type: Number, default: 0 },    // max daily debit allowed
      discount_limit: { type: Number, default: 0 },    // bill discounting limit
    },
  },
  { timestamps: true }
);

// ── Indexes ───────────────────────────────────────────────────────────────────
AccountTreeSchema.index({ account_code: 1 });                           // primary lookup
AccountTreeSchema.index({ parent_code: 1 });                            // tree traversal
AccountTreeSchema.index({ account_type: 1, is_deleted: 1 });           // type-wise filter
AccountTreeSchema.index({ account_type: 1, account_subtype: 1 });      // subtype reports
AccountTreeSchema.index({ is_group: 1, is_deleted: 1 });               // group vs leaf
AccountTreeSchema.index({ is_personal: 1, linked_supplier_id: 1 });   // personal ledger lookup
AccountTreeSchema.index({ linked_supplier_type: 1, is_deleted: 1 });  // all vendor payables, etc.
AccountTreeSchema.index({ tax_type: 1 });                               // GST/TDS compliance
AccountTreeSchema.index({ is_bank_cash: 1, is_deleted: 1 });           // bank/cash accounts
AccountTreeSchema.index({ is_system: 1 });                              // seeding guard
AccountTreeSchema.index({ account_name: "text" });                      // full-text search

const AccountTreeModel = mongoose.model("AccountTree", AccountTreeSchema);
export default AccountTreeModel;
