import mongoose from "mongoose";

// --- Standard Action Schema (Repeated for every module) ---
const Actions = {
  read: { type: Boolean, default: false },
  create: { type: Boolean, default: false },
  edit: { type: Boolean, default: false },
  delete: { type: Boolean, default: false },
  _id: false // Disable ID for sub-documents to save space
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
        project_penalty: Actions
      },

      // --- Projects Module ---
      project: {
        boq_cost: Actions,
        detailed_estimate: Actions,
        drawing_boq: Actions,
        wbs: Actions,
        schedule: Actions,
        wo_issuance: Actions,
        client_billing: Actions,
        work_progress: Actions,
        material_quantity: Actions,
        stocks: Actions,
        assets: Actions
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
        assets: Actions
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
        work_done: Actions,
        daily_labour_report: Actions,
        machinery_entry: Actions,
        site_assets: Actions,
        weekly_billing: Actions,
        reconciliation: Actions,
        planned_vs_achieved: Actions
      },

      // --- HR Module ---
      hr: {
        employee: Actions,
        attendance: Actions,
        leave: Actions,
        payroll: Actions,
        contract_nmr: Actions,
        nmr: Actions,
        nmr_attendance: Actions
      },

      // --- Finance Module ---
      finance: {
        client_billing: Actions,
        purchase_bill: Actions,
        contractor_bill: Actions,
        debit_credit_note: Actions,
        internal_transfer: Actions,
        bank_transaction: Actions,
        journal_entry: Actions,
        banks: Actions,
        tds: Actions,
        cash_entry: Actions,
        ledger_entry: Actions,
        supplier_outstanding: Actions,
        overall_expenses: Actions
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
        collection_projection: Actions
      },

      // --- Settings ---
      settings: {
        user: Actions,
        roles: Actions,
        master: Actions,
        assets: Actions
      }
    },

    isActive: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "Employee" }
  },
  { timestamps: true }
);

const RoleModel = mongoose.model("Role", RoleSchema);

export default RoleModel;
