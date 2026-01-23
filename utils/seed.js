import EmployeeModel from "../src/module/hr/employee/employee.model.js";
import EmployeeService from "../src/module/hr/employee/employee.service.js";
import RoleModel from "../src/module/role/role.model.js";
import RoleService from "../src/module/role/role.service.js";

// --- 1. Smart Permission Generator ---
const getFullPermissions = () => {
  const allActions = { read: true, create: true, edit: true, delete: true };
  
  // Define the structure matching your Role Schema
  const schemaStructure = {
    tender: ["clients", "tenders", "dlp", "emd", "security_deposit", "project_penalty"],
    project: ["boq_cost", "detailed_estimate", "drawing_boq", "wbs", "schedule", "wo_issuance", "client_billing", "work_progress", "material_quantity", "stocks", "assets"],
    purchase: ["vendor_supplier", "request", "enquiry", "order", "goods_receipt", "bill", "machinery_tracking", "stocks", "assets"],
    site: ["boq_site", "detailed_estimate", "site_drawing", "purchase_request", "material_received", "material_issued", "stock_register", "work_done", "daily_labour_report", "machinery_entry", "site_assets", "weekly_billing", "reconciliation", "planned_vs_achieved"],
    hr: ["employee", "attendance", "leave", "payroll", "contract_nmr", "nmr", "nmr_attendance"],
    finance: ["client_billing", "purchase_bill", "contractor_bill", "debit_credit_note", "internal_transfer", "bank_transaction", "journal_entry", "banks", "tds", "cash_entry", "ledger_entry", "supplier_outstanding", "overall_expenses"],
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
        }
      });

      console.log(`🚀 Created User: ${newUser.name} (${newUser.employeeId})`);
    }

  } catch (error) {
    console.error("❌ Seeding Failed:", error.message);
  }
};