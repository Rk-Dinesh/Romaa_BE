import mongoose from "mongoose";
import { auditPlugin } from "../audit/auditlog.plugin.js";

// --- Standard Action Schema (factory) ---
// Returns a fresh object on every call, so each path gets its own definition.
// Sharing one literal across 80+ paths works in Mongoose today (it deep-clones
// during compilation), but the factory avoids the foot-gun where a future
// plugin or contributor mutates the shared definition and silently affects
// every sub-module at once.
const Actions = () => ({
  read:   { type: Boolean, default: false },
  create: { type: Boolean, default: false },
  edit:   { type: Boolean, default: false },
  delete: { type: Boolean, default: false },
});

const RoleSchema = new mongoose.Schema(
  {
    role_id: { type: String, required: true, unique: true },
    roleName: { type: String, required: true, unique: true, uppercase: true },
    description: String,

    permissions: {
      // --- Dashboard (Simple Read) ---
      dashboard: { read: { type: Boolean, default: false } },

      // --- Tender Module ---
      tender: {
        clients: Actions(),
        tenders: Actions(),
        dlp: Actions(),
        emd: Actions(),
        security_deposit: Actions(),
        project_penalty: Actions(),
      },

      // --- Projects Module ---
      project: {
        boq_cost: Actions(),
        detailed_estimate: Actions(),
        drawing_boq: Actions(),
        site_drawing: Actions(),
        wbs: Actions(),
        schedule: Actions(),
        wo_issuance: Actions(),
        client_billing: Actions(),
        work_progress: Actions(),
        material_quantity: Actions(),
        stocks: Actions(),
        assets: Actions(),
      },

      // --- Purchase Module ---
      purchase: {
        vendor_supplier: Actions(),
        request: Actions(),
        enquiry: Actions(),
        order: Actions(),
        goods_receipt: Actions(),
        bill: Actions(),
        machinery_tracking: Actions(),
        stocks: Actions(),
        assets: Actions(),
      },

      // --- Site Module ---
      site: {
        boq_site: Actions(),
        detailed_estimate: Actions(),
        site_drawing: Actions(),
        purchase_request: Actions(),
        material_received: Actions(),
        material_issued: Actions(),
        stock_register: Actions(),
        workorder_done: Actions(),
        work_done: Actions(),
        daily_labour_report: Actions(),
        machinery_entry: Actions(),
        site_assets: Actions(),
        weekly_billing: Actions(),
        reconciliation: Actions(),
        planned_vs_achieved: Actions(),
      },

      // --- HR Module ---
      hr: {
        employee: Actions(),
        attendance: Actions(),
        leave: Actions(),
        holiday: Actions(),
        policy_leave: Actions(),
        weekly_off: Actions(),
        department: Actions(),
        payroll: Actions(),
        contract_nmr: Actions(),
        nmr: Actions(),
        nmr_attendance: Actions(),
        geofence: Actions(),
        scorecard: Actions(),
      },

      // --- Finance Module ---
      finance: {
        // Core Billing
        client_billing: Actions(),
        purchase_bill: Actions(),
        contractor_bill: Actions(),
        supplier_outstanding: Actions(),
        // Banking & Setup
        banks: Actions(),
        company_bank_details: Actions(),
        bank_transaction: Actions(),
        internal_transfer: Actions(),
        // Ledger & Accounting
        ledger_entry: Actions(),
        journal_entry: Actions(),
        cash_entry: Actions(),
        // Adjustments & Compliance
        debit_credit_note: Actions(),
        overall_expenses: Actions(),
        // Finance Reports
        trial_balance: Actions(),
        profit_loss: Actions(),
        balance_sheet: Actions(),
        general_ledger: Actions(),
        cash_flow: Actions(),
        gstr1: Actions(),
        gstr2b: Actions(),
        gstr3b: Actions(),
        itc_reversal: Actions(),
        tds_register: Actions(),
        // Finance Tier 2
        bank_reconciliation: Actions(),
        recurring_vouchers: Actions(),
        budgets: Actions(),
        aging_reports: Actions(),
        fixed_assets: Actions(),
        form_26q: Actions(),
        // Finance Tier 3
        einvoice: Actions(),
        ewaybill: Actions(),
        gst_matcher: Actions(),
        advance_allocation: Actions(),
        retention: Actions(),
        audit_trail: Actions(),
        form_24q: Actions(),
        form_16: Actions(),
        form_16a: Actions(),
        gstr9: Actions(),
        // Finance Tier 4
        consolidation: Actions(),
        tender_profitability: Actions(),
        cash_flow_forecast: Actions(),
        fund_flow: Actions(),
        ratio_analysis: Actions(),
        contract_poc: Actions(),
        supplier_scorecard: Actions(),
        approval: Actions(),
        statutory_deadline: Actions(),
        form_26as: Actions(),
        ledger_seal: Actions(),
        year_end_close: Actions(),
        finance_attachment: Actions(),
        expense_voucher: Actions(),
        currency: Actions(),
        finance_settings: Actions(),
        webhooks: Actions(),
        bulk_import_export: Actions(),
        account_browser: Actions(),
      },

      // --- Asset Module (registry, custody, calibration) ---
      // Separate top-level module — distinct from project.assets / purchase.assets
      // / site.site_assets which gate per-context UIs in those modules.
      asset: {
        category_master:        Actions(),   // AssetCategoryMaster (settings master)
        machinery:              Actions(),   // MachineryAsset (heavy: GPS/fuel/HMR)
        machinery_logs:         Actions(),   // MachineDailyLog (daily usage)
        maintenance:            Actions(),   // MaintenanceLog (service/breakdown)
        fuel_telemetry:         Actions(),   // GPS / fuel sync from third-party
        tagged_asset:           Actions(),   // Tools, IT, Survey, Furniture, single SiteInfra
        bulk_inventory:         Actions(),   // Formwork, Scaffolding, PPE, Fencing
        issuance:               Actions(),   // Cross-cutting custody (issue / return)
        calibration:            Actions(),   // Survey/Lab calibration certificates
        preventive_maintenance: Actions(),   // PM plans (interval-based scheduler)
        work_order:             Actions(),   // WorkOrder (corrective + PM workflow)
        inspection:             Actions(),   // Inspection templates + submissions
        operator_cert:          Actions(),   // Operator licensing register
        kpi:                    Actions(),   // Reliability dashboards (MTBF/MTTR/OEE)
        subcomponent:           Actions(),   // Tyres / batteries / wear parts
        insurance_claim:        Actions(),   // Insurance incident & settlement
        rental:                 Actions(),   // Rental agreements + invoice rollups
      },

      // --- Audit Log (app-wide, non-finance) ---
      audit: {
        trail: Actions(),   // view/search cross-module audit trail
      },

      // --- Approval Module (generic, cross-cutting) ---
      approval: {
        requests:   Actions(),   // view / act on approval requests
        my_pending: Actions(),   // personal inbox of pending approvals
        rules:      Actions(),   // configure rules in Settings (admin)
        simulator:  Actions(),   // dry-run "who approves what" simulator
      },

      // --- Reports Module ---
      report: {
        project_dashboard: Actions(),
        work_analysis: Actions(),
        client_billing: Actions(),
        financial_report: Actions(),
        pnl: Actions(),
        cash_flow: Actions(),
        expenses_report: Actions(),
        vendor_report: Actions(),
        reconciliation: Actions(),
        actual_vs_billed: Actions(),
        cost_to_complete: Actions(),
        planned_vs_actual: Actions(),
        labour_productivity: Actions(),
        machine_productivity: Actions(),
        collection_projection: Actions(),
      },

      // --- Settings ---
      // Notes:
      //  - `assets` moved to its own top-level `asset` module above.
      //  - `audit_trail` and `audit_retention` removed — they were never wired
      //     to any route. Audit access is gated by the top-level `audit.trail`
      //     (cross-module trail) or `finance.audit_trail` (finance-scoped).
      settings: {
        user: Actions(),
        roles: Actions(),
        master: Actions(),
        hsn_sac: Actions(),
        approval_config: Actions(),   // gates the Settings > Approval Rules UI
      },
    },

    isActive: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "Employee" },
  },
  { timestamps: true },
);

// --- Authorization helper ---
// Single source of authorization logic. Used by Auth middleware and any
// non-route caller (cron audience pickers, webhook fan-out, AI tooling, etc.)
// that needs to ask "is this role allowed to do X?" without re-deriving the
// nested-permissions traversal every time.
//
// Usage:   role.can("asset", "tagged_asset", "edit")
//          role.can("dashboard", null, "read")    // simple module
RoleSchema.methods.can = function (module, sub, action = "read") {
  const modPerms = this.permissions?.[module];
  if (!modPerms) return false;
  if (!sub) return modPerms[action] === true;
  return modPerms[sub]?.[action] === true;
};

RoleSchema.plugin(auditPlugin, { entity_type: "Role", entity_no_field: "role_id" });

const RoleModel = mongoose.model("Role", RoleSchema);

export default RoleModel;
