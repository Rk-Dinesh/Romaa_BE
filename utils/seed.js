import EmployeeModel from "../src/module/hr/employee/employee.model.js";
import EmployeeService from "../src/module/hr/employee/employee.service.js";
import RoleModel from "../src/module/role/role.model.js";
import RoleService from "../src/module/role/role.service.js";
import CurrencyModel from "../src/module/finance/currency/currency.model.js";
import FinanceSettingsModel from "../src/module/finance/settings/financesettings.model.js";

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
    settings: ["user", "roles", "master", "assets"]
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