import mongoose from "mongoose";
import { auditPlugin } from "../../audit/auditlog.plugin.js";

// --- MAIN ITEM SCHEMA ---
// NOTE: inward_history and outward_history arrays were removed.
// Transactions now live in the separate MaterialTransaction collection to prevent
// the parent document from growing past MongoDB's 16 MB BSON limit on active projects.
// Stock counters (total_received_qty, total_issued_qty, current_stock_on_hand,
// pending_procurement_qty) are maintained atomically via $inc in material.service.js.
const MaterialItemSchema = new mongoose.Schema(
  {
    // ==========================================
    // SECTION A: REAL QUANTITIES (Budget/Estimates)
    // ==========================================
    item_description: { type: String, default: "" },
    category: { type: String, default: "" },
    unit: { type: String, default: "" },
    hsnSac: { type: String, default: "" },
    type: { type: String, default: "" },
    shortDescription: { type: String, default: "" },
    taxStructure: {
      igst: { type: Number, default: 0 },
      cgst: { type: Number, default: 0 },
      sgst: { type: Number, default: 0 },
      cess: { type: Number, default: 0 },
    },

    // The breakdown of estimated quantities (e.g., per floor)
    quantity: [{ type: Number, default: 0 }],

    // The Total Budgeted Quantity (Sum of 'quantity' array) — recomputed by pre-save
    total_item_quantity: { type: Number, default: 0 },

    unit_rate: { type: Number, default: 0 },
    resourceGroup: { type: String, default: "" },
    // Budgeted Amount — recomputed by pre-save
    total_amount: { type: Number, default: 0 },

    // ==========================================
    // SECTION B: INVENTORY TRACKING (Dynamic)
    // Managed exclusively via $inc — NOT recomputed in pre-save
    // ==========================================
    opening_stock:           { type: Number, default: 0 },
    total_received_qty:      { type: Number, default: 0 },
    total_issued_qty:        { type: Number, default: 0 },
    current_stock_on_hand:   { type: Number, default: 0 },
    pending_procurement_qty: { type: Number, default: 0 },
  },
  { _id: true },
);

const materialSchema = new mongoose.Schema(
  {
    tender_id: { type: String, default: "" },
    items: [MaterialItemSchema],
    created_by_user: { type: String, default: "ADMIN" },
  },
  { timestamps: true },
);

// --- MIDDLEWARE: BUDGET CALCULATIONS ONLY ---
// Only recomputes budget-derived fields (total_item_quantity, total_amount).
// Stock counters (total_received_qty, total_issued_qty, current_stock_on_hand,
// pending_procurement_qty) are managed atomically via $inc in material.service.js
// and must NOT be touched here — overwriting them would corrupt live stock data.
materialSchema.pre("save", function (next) {
  if (this.items && this.items.length > 0) {
    this.items.forEach((item) => {
      // 1. Recompute budgeted total from the quantity breakdown array
      if (item.quantity && item.quantity.length > 0) {
        item.total_item_quantity = item.quantity.reduce((a, b) => a + b, 0);
      }

      // 2. Recompute budgeted amount
      item.total_amount = item.total_item_quantity * item.unit_rate;
    });
  }
  next();
});

materialSchema.index({ tender_id: 1 });

materialSchema.plugin(auditPlugin, { entity_type: "Material" });

const MaterialModel = mongoose.model("materials", materialSchema);

export default MaterialModel;
