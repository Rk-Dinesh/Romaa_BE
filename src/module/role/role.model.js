import mongoose from "mongoose";

// --- Standard Action Schema (Repeated for every module) ---
const Actions = {
  read: { type: Boolean, default: false },
  create: { type: Boolean, default: false },
  edit: { type: Boolean, default: false },
  delete: { type: Boolean, default: false },
  _id: false, // Disable ID for sub-documents to save space
};

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
        clients: Actions,
        tenders: Actions,
        dlp: Actions,
        emd: Actions,
        security_deposit: Actions,
        project_penalty: Actions,
      },

      // --- Projects Module ---
      project: {
        boq_cost: Actions,
        detailed_estimate: Actions,
        drawing_boq: Actions,
        site_drawing: Actions,
        wbs: Actions,
        schedule: Actions,
        wo_issuance: Actions,
        client_billing: Actions,
        work_progress: Actions,
        material_quantity: Actions,
        stocks: Actions,
        assets: Actions,
      },

      // --- Purchase Module ---
      purchase: {
        vendor_supplier: Actions,
        request: Actions,
        enquiry: Actions,
        order: Actions,
        goods_receipt: Actions,
        bill: Actions,
        machinery_tracking: Actions,
        stocks: Actions,
        assets: Actions,
      },

      // --- Site Module ---
      site: {
        boq_site: Actions,
        detailed_estimate: Actions,
        site_drawing: Actions,
        purchase_request: Actions,
        material_received: Actions,
        material_issued: Actions,
        stock_register: Actions,
        workorder_done: Actions,
        work_done: Actions,
        daily_labour_report: Actions,
        machinery_entry: Actions,
        site_assets: Actions,
        weekly_billing: Actions,
        reconciliation: Actions,
        planned_vs_achieved: Actions,
      },

      // --- HR Module ---
      hr: {
        employee: Actions,
        attendance: Actions,
        leave: Actions,
        payroll: Actions,
        contract_nmr: Actions,
        nmr: Actions,
        nmr_attendance: Actions,
        geofence: Actions,
        scorecard: Actions,
      },

      // --- Finance Module ---
      finance: {
        // Core Billing
        client_billing: Actions,
        purchase_bill: Actions,
        contractor_bill: Actions,
        supplier_outstanding: Actions,
        // Banking & Setup
        banks: Actions,
        company_bank_details: Actions,
        bank_transaction: Actions,
        internal_transfer: Actions,
        // Ledger & Accounting
        ledger_entry: Actions,
        journal_entry: Actions,
        cash_entry: Actions,
        // Adjustments & Compliance
        debit_credit_note: Actions,
        overall_expenses: Actions,
        // Finance Reports
        trial_balance: Actions,
        profit_loss: Actions,
        balance_sheet: Actions,
        general_ledger: Actions,
        cash_flow: Actions,
        gstr1: Actions,
        gstr2b: Actions,
        gstr3b: Actions,
        itc_reversal: Actions,
        tds_register: Actions,
        // Finance Tier 2
        bank_reconciliation: Actions,
        recurring_vouchers: Actions,
        budgets: Actions,
        aging_reports: Actions,
        fixed_assets: Actions,
        form_26q: Actions,
        // Finance Tier 3
        einvoice: Actions,
        ewaybill: Actions,
        gst_matcher: Actions,
        advance_allocation: Actions,
        retention: Actions,
        audit_trail: Actions,
        form_24q: Actions,
        form_16: Actions,
        form_16a: Actions,
        gstr9: Actions,
        // Finance Tier 4
        consolidation: Actions,
        tender_profitability: Actions,
        cash_flow_forecast: Actions,
        fund_flow: Actions,
        ratio_analysis: Actions,
        contract_poc: Actions,
        supplier_scorecard: Actions,
        approvals: Actions,
        statutory_deadlines: Actions,
        form26as: Actions,
        ledger_seal: Actions,
        year_end_close: Actions,
        finance_attachment: Actions,
        expense_voucher: Actions,
        currency: Actions,
        finance_settings: Actions,
        webhooks: Actions,
        bulk_import_export: Actions,
        account_browser: Actions,
      },

      // --- Reports Module ---
      report: {
        project_dashboard: Actions,
        work_analysis: Actions,
        client_billing: Actions,
        financial_report: Actions,
        pnl: Actions,
        cash_flow: Actions,
        expenses_report: Actions,
        vendor_report: Actions,
        reconciliation: Actions,
        actual_vs_billed: Actions,
        cost_to_complete: Actions,
        planned_vs_actual: Actions,
        labour_productivity: Actions,
        machine_productivity: Actions,
        collection_projection: Actions,
      },

      // --- Settings ---
      settings: {
        user: Actions,
        roles: Actions,
        master: Actions,
        assets: Actions,
        hsn_sac: Actions,
      },
    },

    isActive: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "Employee" },
  },
  { timestamps: true },
);

const RoleModel = mongoose.model("Role", RoleSchema);

export default RoleModel;
