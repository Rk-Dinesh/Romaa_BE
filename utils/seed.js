import EmployeeModel from "../src/module/hr/employee/employee.model.js";
import EmployeeService from "../src/module/hr/employee/employee.service.js";
import RoleModel from "../src/module/role/role.model.js";
import RoleService from "../src/module/role/role.service.js";
import CurrencyModel from "../src/module/finance/currency/currency.model.js";
import FinanceSettingsModel from "../src/module/finance/settings/financesettings.model.js";
import ApprovalRuleModel, { APPROVER_STRATEGY } from "../src/module/approval/approvalrule.model.js";
import AssetCategoryService from "../src/module/master/assetcategory/assetcategory.service.js";
import IdcodeServices from "../src/module/idcode/idcode.service.js";
import DepartmentModel from "../src/module/hr/department/department.model.js";
import WeeklyOffPolicyModel from "../src/module/hr/weeklyOffPolicy/weeklyOffPolicy.model.js";
import LeavePolicyModel from "../src/module/hr/leavePolicy/leavePolicy.model.js";

// --- 1. Smart Permission Generator ---
// Derives the "all-true" permission tree directly from RoleModel.schema.
// The Role schema is the single source of truth — adding a new module or
// sub-module there is the only place to update. The seed picks it up
// automatically on next boot, so drift between schema and seed is impossible.
const ACTION_KEYS = ["read", "create", "edit", "delete"];

const getFullPermissions = () => {
  const schemaTree = RoleModel.schema.tree.permissions;
  const allTrue = { read: true, create: true, edit: true, delete: true };
  const out = {};

  for (const [moduleName, moduleDef] of Object.entries(schemaTree)) {
    if (!moduleDef || typeof moduleDef !== "object") continue;

    // Sub-module names = keys that aren't action keys or Mongoose internals.
    const subKeys = Object.keys(moduleDef).filter(
      (k) => !ACTION_KEYS.includes(k) && k !== "_id"
    );

    if (subKeys.length === 0) {
      // Simple module like `dashboard` — only direct action keys.
      out[moduleName] = {};
      for (const action of ACTION_KEYS) {
        if (moduleDef[action]) out[moduleName][action] = true;
      }
    } else {
      // Nested module — each sub-key gets all four actions.
      out[moduleName] = {};
      for (const sub of subKeys) out[moduleName][sub] = { ...allTrue };
    }
  }

  return out;
};

// --- 2. Seed Execution Function ---
export const seedDatabase = async () => {
  try {
    console.log("🌱 Checking Database Seeds...");

    // --- A. Check & Create/Refresh DEV Role ---
    // DEV is the super-admin role — its permissions are always "everything in
    // the schema." We backfill on every boot so that adding a new module to
    // RoleSchema instantly grants DEV access without a manual migration.
    const devPermissions = getFullPermissions();
    let devRole = await RoleModel.findOne({ roleName: "DEV" });

    if (devRole) {
      // Atomically replace permissions with the freshly-derived all-true tree.
      // findByIdAndUpdate avoids change-detection issues with deeply-nested paths.
      devRole = await RoleModel.findByIdAndUpdate(
        devRole._id,
        { permissions: devPermissions },
        { new: true, runValidators: true }
      );
      console.log("✅ DEV Role exists — permissions refreshed from schema.");
    } else {
      console.log("⚠️ DEV Role not found. Creating...");
      // Use RoleService to ensure 'ROL-XXX' ID generation works
      devRole = await RoleService.createRole({
        roleName: "DEV",
        description: "System Developer / Super Admin",
        permissions: devPermissions,
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

    // --- G. Seed asset category master (idempotent) ---
    await seedAssetCategories();

    // --- H. Register ID code prefixes for new asset modules (idempotent) ---
    await seedAssetIdCodes();

    // --- I. HR — Departments (idempotent) ---
    await seedDepartments();

    // --- J. HR — Default Weekly-Off Policy (idempotent) ---
    await seedWeeklyOffPolicy();

    // --- K. HR — Default Leave Policy (idempotent) ---
    await seedLeavePolicy();

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

// IdcodeServices.addIdCode is idempotent — it returns the existing entry
// rather than creating a duplicate. Safe to call on every boot.
const seedAssetIdCodes = async () => {
  try {
    const idCodes = [
      { name: "TAGGED_ASSET",       prefix: "TGA" },
      { name: "BULK_INVENTORY",     prefix: "BLK" },
      { name: "BULK_INV_TXN",       prefix: "BIT" },
      { name: "ASSET_ISSUANCE",     prefix: "ISS" },
      { name: "ASSET_CALIBRATION",  prefix: "CAL" },
      // Tier-2 industrial-grade additions
      { name: "MACHINERY_ASSET",    prefix: "MAC" },
      { name: "MAINTENANCE_LOG",    prefix: "MNT" },
      { name: "PM_PLAN",            prefix: "PMP" },
      { name: "WORK_ORDER",         prefix: "WO" },
      { name: "INSP_TEMPLATE",      prefix: "ITP" },
      { name: "ASSET_INSPECTION",   prefix: "INS" },
      { name: "OPERATOR_CERT",      prefix: "OPC" },
      { name: "INSURANCE_CLAIM",    prefix: "ICL" },
      { name: "RENTAL_AGREEMENT",   prefix: "RNT" },
      { name: "RENTAL_INVOICE",     prefix: "RIV" },
    ];
    for (const c of idCodes) {
      await IdcodeServices.addIdCode(c.name, c.prefix);
    }
    console.log(`✅ Asset ID codes registered (${idCodes.length}).`);
  } catch (error) {
    console.error("❌ Asset ID code seed failed:", error.message);
  }
};

const seedAssetCategories = async () => {
  try {
    const result = await AssetCategoryService.seedDefaults();
    console.log(
      `✅ Asset categories seeded (${result.inserted} new, ${result.existing} existing of ${result.totalSeed}).`
    );
  } catch (error) {
    console.error("❌ Asset category seed failed:", error.message);
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

// ── HR — Departments ─────────────────────────────────────────────────────────
// Construction-and-projects company defaults. headId is left null — HR fills
// in HOD via /department/upsert once employees are tagged. Idempotent.
const DEFAULT_DEPARTMENTS = [
  { name: "Engineering",        code: "ENG", description: "Software + hardware engineering teams" },
  { name: "Site Operations",    code: "OPS", description: "Field operations, construction sites" },
  { name: "Finance",            code: "FIN", description: "Accounting, payroll, treasury" },
  { name: "HR & Admin",         code: "HRA", description: "Human resources and administration" },
  { name: "Procurement",        code: "PRC", description: "Purchase, vendor management" },
  { name: "Project Management", code: "PM",  description: "Project planning and delivery" },
  { name: "Quality Control",    code: "QC",  description: "Quality assurance and audits" },
  { name: "Safety",             code: "EHS", description: "Environment, health, and safety" },
];

const seedDepartments = async () => {
  try {
    let created = 0;
    for (const d of DEFAULT_DEPARTMENTS) {
      const existing = await DepartmentModel.findOne({ name: d.name });
      if (existing) continue;
      await DepartmentModel.create({ ...d, headId: null, isActive: true });
      created += 1;
    }
    console.log(`✅ HR Departments seeded (${created} new, ${DEFAULT_DEPARTMENTS.length - created} existing).`);
  } catch (error) {
    console.error("❌ Department seed failed:", error.message);
  }
};

// ── HR — Default Weekly-Off Policy ───────────────────────────────────────────
// Mirrors the legacy hardcoded fallback (Sunday + 2nd/4th Saturday off) so
// behaviour is explicit and editable from /weeklyoff/upsert. Per-department
// overrides are HR's job after this seeds. Idempotent.
const seedWeeklyOffPolicy = async () => {
  try {
    const existing = await WeeklyOffPolicyModel.findOne({ department: "DEFAULT" });
    if (existing) {
      console.log("✅ Weekly-off policy (DEFAULT) already exists.");
      return;
    }
    await WeeklyOffPolicyModel.create({
      department: "DEFAULT",
      weeklyOffs: [
        { dow: 0, label: "Sunday" },
        { dow: 6, weeks: [2, 4], label: "2nd & 4th Saturday" },
      ],
      isActive: true,
      notes:
        "Default 6-day work week — Sunday + 2nd/4th Saturday off. " +
        "HR can override per department via /weeklyoff/upsert.",
    });
    console.log("🚀 Seeded DEFAULT weekly-off policy (Sun + 2nd/4th Sat).");
  } catch (error) {
    console.error("❌ Weekly-off policy seed failed:", error.message);
  }
};

// ── HR — Default Leave Policy ────────────────────────────────────────────────
// Mirrors LeavePolicyService.FALLBACK_RULES so the active policy at the
// "DEFAULT" scope produces the same numbers the hardcoded fallback would —
// HR can then clone this row per department via /leavepolicy/upsert and
// tweak refill modes, accrual, blackouts, HOD requirements, etc.
//
// Idempotent: only inserts when no active DEFAULT policy exists. If you
// need to refresh the seeded rules, deactivate the row in the UI first.
const buildDefaultLeavePolicy = () => ({
  policyName: "Standard",
  scope: "DEFAULT",
  effectiveFrom: new Date(`${new Date().getFullYear()}-01-01T00:00:00Z`),
  effectiveTo: null,
  isActive: true,
  notes:
    "Baseline leave policy mirroring FALLBACK_RULES. " +
    "Clone this row per department via /leavepolicy/upsert and tweak rules as needed.",
  rules: [
    {
      leaveType: "CL",
      refillType: "ANNUAL_RESET",
      annualEntitlement: 12,
      carryForwardCap: 0,
      encashable: false,
      probationEligible: false,
      proRataForNewJoiners: true,
      maxConsecutiveDays: 3,
      requiresManagerApproval: true,
      requiresHRApproval: true,
      autoApproveUnderDays: 1,
    },
    {
      leaveType: "SL",
      refillType: "ANNUAL_RESET",
      annualEntitlement: 12,
      carryForwardCap: 0,
      encashable: false,
      probationEligible: true,
      proRataForNewJoiners: true,
      docsRequiredAfterDays: 3,
      requiresManagerApproval: true,
      requiresHRApproval: true,
    },
    {
      leaveType: "PL",
      refillType: "MONTHLY_ACCRUAL",
      annualEntitlement: 24,
      accrualPerPeriod: 2,
      carryForwardCap: 30,
      encashable: true,
      encashmentBasis: "BASIC",
      probationEligible: false,
      proRataForNewJoiners: true,
      minNoticeDays: 7,
      maxConsecutiveDays: 30,
      requiresManagerApproval: true,
      requiresHRApproval: true,
      escalationAfterHours: 48,
    },
    {
      leaveType: "Maternity",
      refillType: "ANNUAL_RESET",
      annualEntitlement: 84,
      carryForwardCap: 0,
      encashable: false,
      proRataForNewJoiners: true,
      requiresManagerApproval: false,
      requiresHRApproval: true,
    },
    {
      leaveType: "Paternity",
      refillType: "ANNUAL_RESET",
      annualEntitlement: 15,
      carryForwardCap: 0,
      encashable: false,
      proRataForNewJoiners: true,
      requiresManagerApproval: true,
      requiresHRApproval: true,
    },
    {
      leaveType: "Bereavement",
      refillType: "ANNUAL_RESET",
      annualEntitlement: 5,
      carryForwardCap: 0,
      encashable: false,
      proRataForNewJoiners: true,
      requiresManagerApproval: true,
      requiresHRApproval: false,
    },
    {
      leaveType: "CompOff",
      refillType: "EARNED",
      validityDays: 60,
      requiresManagerApproval: true,
      requiresHRApproval: false,
    },
    {
      leaveType: "Permission",
      refillType: "MONTHLY_RESET",
      monthlyCap: 3,
      requiresManagerApproval: true,
      requiresHRApproval: false,
      autoApproveUnderDays: 0,
    },
    {
      leaveType: "LWP",
      refillType: "MANUAL_ONLY",
      requiresManagerApproval: true,
      requiresHRApproval: true,
    },
  ],
});

const seedLeavePolicy = async () => {
  try {
    const existing = await LeavePolicyModel.findOne({ scope: "DEFAULT", isActive: true });
    if (existing) {
      console.log("✅ Leave policy (DEFAULT) already exists.");
      return;
    }
    const policy = buildDefaultLeavePolicy();
    await LeavePolicyModel.create({ ...policy, createdBy: null, updatedBy: null });
    console.log(
      `🚀 Seeded DEFAULT leave policy with ${policy.rules.length} rules ` +
      `(CL, SL, PL, Maternity, Paternity, Bereavement, CompOff, Permission, LWP).`
    );
  } catch (error) {
    console.error("❌ Leave policy seed failed:", error.message);
  }
};