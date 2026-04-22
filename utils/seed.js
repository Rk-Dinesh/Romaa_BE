import EmployeeModel from "../src/module/hr/employee/employee.model.js";
import EmployeeService from "../src/module/hr/employee/employee.service.js";
import RoleModel from "../src/module/role/role.model.js";
import RoleService from "../src/module/role/role.service.js";
import CurrencyModel from "../src/module/finance/currency/currency.model.js";
import FinanceSettingsModel from "../src/module/finance/settings/financesettings.model.js";
import ApprovalRuleModel, { APPROVER_STRATEGY } from "../src/module/approval/approvalrule.model.js";

// --- 1. Smart Permission Generator ---
const getFullPermissions = () => {
  const allActions = { read: true, create: true, edit: true, delete: true };
  
  // Define the structure matching your Role Schema
  const schemaStructure = {
    tender: ["clients", "tenders", "dlp", "emd", "security_deposit", "project_penalty"],
    project: ["boq_cost", "detailed_estimate", "drawing_boq", "wbs", "schedule", "wo_issuance", "client_billing", "work_progress", "material_quantity", "stocks", "assets"],
    purchase: ["vendor_supplier", "request", "enquiry", "order", "goods_receipt", "bill", "machinery_tracking", "stocks", "assets"],
    site: ["boq_site", "detailed_estimate", "site_drawing", "purchase_request", "material_received", "material_issued", "stock_register", "work_done", "daily_labour_report", "machinery_entry", "site_assets", "weekly_billing", "reconciliation", "planned_vs_achieved"],
    hr: ["employee", "attendance", "leave", "payroll", "holidays", "geofence", "contract_nmr", "nmr", "nmr_attendance"],
    finance: ["client_billing", "purchase_bill", "contractor_bill", "debit_credit_note", "internal_transfer", "bank_transaction", "journal_entry", "banks", "tds", "cash_entry", "ledger_entry", "supplier_outstanding", "overall_expenses", "company_bank_details", "trial_balance", "profit_loss", "general_ledger", "balance_sheet", "cash_flow", "gstr1", "gstr2b", "gstr3b", "itc_reversal", "tds_register", "bank_reconciliation", "recurring_vouchers", "budgets", "aging_reports", "fixed_assets", "form_26q", "einvoice", "ewaybill", "gst_matcher", "advance_allocation", "retention", "audit_trail", "form_16", "form_16a", "form_24q", "gstr9", "contract_poc", "approval", "consolidation", "expense_voucher", "ledger_seal", "retention_ledger", "statutory_deadline", "supplier_scorecard", "year_end_close", "form_26as", "finance_attachment"],
    report: ["project_dashboard", "work_analysis", "client_billing", "financial_report", "pnl", "cash_flow", "expenses_report", "vendor_report", "reconciliation", "actual_vs_billed", "cost_to_complete", "planned_vs_actual", "labour_productivity", "machine_productivity", "collection_projection"],
    approval: ["requests", "my_pending", "rules", "simulator"],
    audit:    ["trail"],
    settings: ["user", "roles", "master", "assets", "hsn_sac", "approval_config"]
  };

  const permissions = {
    dashboard: { read: true } // Simple module
  };

  // Loop through structure to generate "All True" permissions
  for (const [moduleName, subModules] of Object.entries(schemaStructure)) {
    permissions[moduleName] = {};
    subModules.forEach(sub => {
      permissions[moduleName][sub] = allActions;
    });
  }

  return permissions;
};

// --- 2. Seed Execution Function ---
export const seedDatabase = async () => {
  try {
    console.log("🌱 Checking Database Seeds...");

    // --- A. Check & Create DEV Role ---
    let devRole = await RoleModel.findOne({ roleName: "DEV" });

    if (devRole) {
      console.log("✅ DEV Role already exists.");
    } else {
      console.log("⚠️ DEV Role not found. Creating...");
      
      // 🔥 FIX: Actually calling the function now
      const devPermissions = getFullPermissions();

      // Use RoleService to ensure 'ROL-XXX' ID generation works
      devRole = await RoleService.createRole({
        roleName: "DEV",
        description: "System Developer / Super Admin",
        permissions: devPermissions 
      });
      
      console.log(`🚀 Created DEV Role: ${devRole.roleName} (${devRole.role_id})`);
    }

    // --- B. Check & Create Dev User ---
    const devEmail = "tech@gmail.com";
    const existingUser = await EmployeeModel.findOne({ email: devEmail });

    if (existingUser) {
      console.log("✅ Dev User already exists.");
    } else {
      console.log("⚠️ Dev User not found. Creating...");

      // Use EmployeeService to ensure 'EMP-XXX' ID generation and Hashing work
      const newUser = await EmployeeService.addEmployee({
        name: "Infraa",
        email: devEmail,
        password: "infraTech", // Service/Model middleware will hash this
        phone: "9999999999",   // Required field
        role: devRole._id,     // Assign the DEV role objectId
        userType: "Office",
        designation: "System Admin",
        dateOfJoining: new Date(),
        address: {
            street: "Tech Park",
            city: "Chennai",
            state: "TN",
            pincode: "600000"
        },
        idProof: {
            type: "PAN",
            number: "ABCDE1234F"
        },
        accessMode:"BOTH"
      });

      console.log(`🚀 Created User: ${newUser.name} (${newUser.employeeId})`);
    }

    // --- C. Seed default currencies ---
    await seedCurrencies();

    // --- D. Seed default finance settings ---
    await seedFinanceSettings();

    // --- E. Seed named approver roles (idempotent) ---
    await seedNamedRoles();

    // --- F. Seed default approval rule matrix (idempotent) ---
    await seedApprovalRules();

  } catch (error) {
    console.error("❌ Seeding Failed:", error.message);
  }
};

// ── Default currency seed ─────────────────────────────────────────────────────
// Runs only if the CurrencyMaster collection is empty.
// INR is the company base currency (is_base: true).
const DEFAULT_CURRENCIES = [
  { code: "INR", name: "Indian Rupee",         symbol: "₹",  decimals: 2, is_base: true,  is_active: true },
  { code: "USD", name: "US Dollar",             symbol: "$",  decimals: 2, is_base: false, is_active: true },
  { code: "EUR", name: "Euro",                  symbol: "€",  decimals: 2, is_base: false, is_active: true },
  { code: "GBP", name: "British Pound Sterling",symbol: "£",  decimals: 2, is_base: false, is_active: true },
  { code: "AED", name: "UAE Dirham",            symbol: "د.إ",decimals: 2, is_base: false, is_active: true },
  { code: "SGD", name: "Singapore Dollar",      symbol: "S$", decimals: 2, is_base: false, is_active: true },
];

// ── Finance settings seed ─────────────────────────────────────────────────────
// Uses upsert — safe to run on every startup; won't overwrite existing values.
const seedFinanceSettings = async () => {
  try {
    const defaults = [
      { key: "approval.purchasebill.threshold",  value: 50000,   description: "Min bill amount (INR) that requires approval workflow" },
      { key: "approval.paymentvoucher.threshold", value: 100000,  description: "Min PV amount (INR) that requires approval" },
      { key: "finance.default_fin_year",          value: "25-26", description: "Default financial year for queries" },
      { key: "tds.default_section",               value: "194C",  description: "Default TDS section for contractor payments" },
      { key: "bulk.import.max_rows",              value: 5000,    description: "Maximum rows allowed per bulk import" },
    ];
    for (const s of defaults) {
      await FinanceSettingsModel.findOneAndUpdate({ key: s.key }, s, { upsert: true });
    }
    console.log("✅ Finance settings seeded.");
  } catch (error) {
    console.error("❌ Finance settings seeding failed:", error.message);
  }
};

// ── Named approver roles seed ─────────────────────────────────────────────────
// These role names are referenced by approval rules (ROLE strategy). Created
// with empty permissions — admins assign permissions in the Settings UI after
// tagging employees to these roles. Idempotent.
const NAMED_ROLES = [
  { roleName: "CEO",              description: "Chief Executive Officer" },
  { roleName: "MD",               description: "Managing Director" },
  { roleName: "CFO",              description: "Chief Financial Officer" },
  { roleName: "FINANCE_HEAD",     description: "Head of Finance" },
  { roleName: "ACCOUNTS_HEAD",    description: "Head of Accounts" },
  { roleName: "HR_HEAD",          description: "Head of HR" },
  { roleName: "PROJECT_HEAD",     description: "Head of Projects" },
  { roleName: "PROJECT_MANAGER",  description: "Project Manager" },
  { roleName: "PROCUREMENT_HEAD", description: "Head of Procurement" },
  { roleName: "SITE_MANAGER",     description: "Site Manager" },
  { roleName: "DEPT_HEAD",        description: "Department Head (generic)" },
  { roleName: "SUPERVISOR",       description: "Supervisor" },
];

const seedNamedRoles = async () => {
  try {
    let created = 0;
    for (const r of NAMED_ROLES) {
      const existing = await RoleModel.findOne({ roleName: r.roleName });
      if (existing) continue;
      await RoleService.createRole({
        roleName: r.roleName,
        description: r.description,
        permissions: {},   // empty — admin assigns via UI
      });
      created += 1;
    }
    console.log(`✅ Named roles seeded (${created} new, ${NAMED_ROLES.length - created} existing).`);
  } catch (error) {
    console.error("❌ Named roles seed failed:", error.message);
  }
};

// ── Default approval rule matrix ──────────────────────────────────────────────
// Ships a working hierarchy out of the box. All rules use ROLE or REPORTS_TO
// strategies so no employee _ids are baked into config — rules survive staff
// changes. Admins can edit/add bands in the Settings UI.
//
// `amount_field` semantics:
//   "days"   → LeaveRequest — the number of leave days
//   "amount" → monetary — INR
//
// Idempotent: upsert per source_type. Existing customised rules aren't touched
// (we only write when the rule doesn't exist yet).
const DEFAULT_APPROVAL_RULES = [
  {
    source_type:  "LeaveRequest",
    module_label: "HR › Leave",
    amount_field: "days",
    thresholds: [
      { min_amount: 0, max_amount: 2,    approver_strategy: APPROVER_STRATEGY.REPORTS_TO, levels: 1, label: "L1: Reporting Manager" },
      { min_amount: 2, max_amount: 5,    approver_strategy: APPROVER_STRATEGY.REPORTS_TO, levels: 2, label: "L1 → L2 chain" },
      { min_amount: 5, max_amount: 9999, approver_strategy: APPROVER_STRATEGY.ROLE,       roles: ["HR_HEAD", "CEO"], label: "HR Head + CEO" },
    ],
  },
  {
    source_type:  "PurchaseRequest",
    module_label: "Purchase › Request",
    amount_field: "amount",
    thresholds: [
      { min_amount: 0,       max_amount: 25000,    approver_strategy: APPROVER_STRATEGY.DEPARTMENT_HEAD, label: "Department Head" },
      { min_amount: 25000,   max_amount: 200000,   approver_strategy: APPROVER_STRATEGY.ROLE, roles: ["PROJECT_MANAGER"], label: "Project Manager" },
      { min_amount: 200000,  max_amount: 99999999, approver_strategy: APPROVER_STRATEGY.ROLE, roles: ["PROJECT_HEAD", "CFO"], label: "Project Head + CFO" },
    ],
  },
  {
    source_type:  "PurchaseOrder",
    module_label: "Purchase › Order",
    amount_field: "amount",
    thresholds: [
      { min_amount: 0,      max_amount: 500000,   approver_strategy: APPROVER_STRATEGY.ROLE, roles: ["PROCUREMENT_HEAD"], label: "Procurement Head" },
      { min_amount: 500000, max_amount: 99999999, approver_strategy: APPROVER_STRATEGY.ROLE, roles: ["CFO", "CEO"], label: "CFO + CEO" },
    ],
  },
  {
    source_type:  "WorkOrder",
    module_label: "Project › Work Order",
    amount_field: "amount",
    thresholds: [
      { min_amount: 0,       max_amount: 1000000,  approver_strategy: APPROVER_STRATEGY.ROLE, roles: ["PROJECT_MANAGER"], label: "Project Manager" },
      { min_amount: 1000000, max_amount: 99999999, approver_strategy: APPROVER_STRATEGY.ROLE, roles: ["PROJECT_HEAD", "MD"], label: "Project Head + MD" },
    ],
  },
  {
    source_type:  "PaymentVoucher",
    module_label: "Finance › Payment Voucher",
    amount_field: "amount",
    thresholds: [
      { min_amount: 0,      max_amount: 50000,    approver_strategy: APPROVER_STRATEGY.ROLE, roles: ["ACCOUNTS_HEAD"], label: "Accounts Head" },
      { min_amount: 50000,  max_amount: 500000,   approver_strategy: APPROVER_STRATEGY.ROLE, roles: ["FINANCE_HEAD"], label: "Finance Head" },
      { min_amount: 500000, max_amount: 99999999, approver_strategy: APPROVER_STRATEGY.ROLE, roles: ["CFO", "MD"], label: "CFO + MD" },
    ],
  },
  {
    source_type:  "WeeklyBilling",
    module_label: "Site › Weekly Billing",
    amount_field: "amount",
    thresholds: [
      { min_amount: 0, max_amount: 99999999, approver_strategy: APPROVER_STRATEGY.ROLE, roles: ["SITE_MANAGER", "PROJECT_HEAD"], label: "Site Manager + Project Head" },
    ],
  },
  {
    source_type:  "BankTransfer",
    module_label: "Finance › Bank Transfer",
    amount_field: "amount",
    thresholds: [
      { min_amount: 0,      max_amount: 100000,   approver_strategy: APPROVER_STRATEGY.ROLE, roles: ["FINANCE_HEAD"], label: "Finance Head" },
      { min_amount: 100000, max_amount: 99999999, approver_strategy: APPROVER_STRATEGY.ROLE, roles: ["CFO", "MD"], label: "CFO + MD" },
    ],
  },
  {
    source_type:  "ClientBilling",
    module_label: "Finance › Client Billing",
    amount_field: "amount",
    thresholds: [
      { min_amount: 0, max_amount: 99999999, approver_strategy: APPROVER_STRATEGY.ROLE, roles: ["PROJECT_HEAD"], label: "Project Head" },
    ],
  },
  {
    source_type:  "JournalEntry",
    module_label: "Finance › Journal Entry",
    amount_field: "amount",
    thresholds: [
      { min_amount: 50000, max_amount: 99999999, approver_strategy: APPROVER_STRATEGY.ROLE, roles: ["ACCOUNTS_HEAD"], label: "Accounts Head" },
    ],
  },
];

const seedApprovalRules = async () => {
  try {
    let created = 0;
    for (const def of DEFAULT_APPROVAL_RULES) {
      const existing = await ApprovalRuleModel.findOne({ source_type: def.source_type });
      if (existing) continue;  // respect customisations made by admin
      await ApprovalRuleModel.create({
        source_type:  def.source_type,
        module_label: def.module_label,
        amount_field: def.amount_field,
        thresholds:   def.thresholds.sort((a, b) => a.min_amount - b.min_amount),
        is_active:    true,
      });
      created += 1;
    }
    console.log(`✅ Approval rules seeded (${created} new, ${DEFAULT_APPROVAL_RULES.length - created} existing).`);
  } catch (error) {
    console.error("❌ Approval rules seed failed:", error.message);
  }
};

const seedCurrencies = async () => {
  try {
    const count = await CurrencyModel.countDocuments();
    if (count > 0) {
      console.log("✅ Currencies already seeded.");
      return;
    }

    console.log("⚠️ Seeding default currencies...");
    await CurrencyModel.insertMany(DEFAULT_CURRENCIES);
    console.log(`🚀 Seeded ${DEFAULT_CURRENCIES.length} currencies (INR as base).`);
  } catch (error) {
    console.error("❌ Currency seeding failed:", error.message);
  }
};