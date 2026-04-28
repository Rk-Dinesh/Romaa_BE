import mongoose, { Schema } from "mongoose";
import { auditPlugin } from "../../audit/auditlog.plugin.js";

// BulkInventoryTransaction — append-only ledger of all stock movements.
// Every receipt, issue, return, transfer, damage, scrap, and adjustment goes
// here. The BulkInventory rollup is recomputed from these on every write.
//
// Soft rule: never edit a transaction. Errors are corrected by posting a
// reverse ADJUSTMENT (positive or negative) so the ledger remains auditable.

const BulkInventoryTransactionSchema = new mongoose.Schema(
  {
    txn_id: { type: String, required: true, unique: true, index: true }, // e.g. "BIT001"

    item_ref: { type: Schema.Types.ObjectId, ref: "BulkInventory", required: true, index: true },
    item_id_label: { type: String, required: true, index: true }, // "BLK001"
    item_name: { type: String, trim: true },

    txn_type: {
      type: String,
      enum: ["RECEIPT", "ISSUE", "RETURN", "TRANSFER", "DAMAGE", "SCRAP", "ADJUSTMENT"],
      required: true,
      index: true,
    },
    txn_date: { type: Date, default: Date.now, index: true },

    quantity: { type: Number, required: true, min: 0 }, // always positive; type implies direction

    // Movement endpoints
    from_location_type: { type: String, enum: ["SITE", "STORE", "VENDOR", "EXTERNAL"] },
    from_location_id: String,
    from_location_name: String,

    to_location_type: { type: String, enum: ["SITE", "STORE", "VENDOR", "EXTERNAL"] },
    to_location_id: String,
    to_location_name: String,

    // Recipient (only for ISSUE/RETURN)
    recipient_kind: { type: String, enum: ["EMPLOYEE", "CONTRACTOR", "SITE", null], default: null },
    recipient_id: String,
    recipient_name: String,

    // Reference document (PO / GRN / Issue Voucher / Indent)
    reference_type: { type: String, trim: true }, // "PO", "GRN", "INDENT", "ADJ", etc.
    reference_number: { type: String, trim: true, index: true },
    reference_url: String,

    // Cost
    unit_cost: { type: Number, min: 0 },
    total_cost: { type: Number, min: 0 },

    // Linkage to the originating issuance (for RETURN, links to the ISSUE txn)
    linked_txn_ref: { type: Schema.Types.ObjectId, ref: "BulkInventoryTransaction", default: null },

    notes: String,
    performed_by: { type: Schema.Types.ObjectId, ref: "Employee" },
  },
  { timestamps: true }
);

BulkInventoryTransactionSchema.index({ item_ref: 1, txn_date: -1 });
BulkInventoryTransactionSchema.index({ txn_type: 1, txn_date: -1 });

BulkInventoryTransactionSchema.plugin(auditPlugin, {
  entity_type: "BulkInventoryTransaction",
  entity_no_field: "txn_id",
});

const BulkInventoryTransactionModel = mongoose.model(
  "BulkInventoryTransaction",
  BulkInventoryTransactionSchema
);
export default BulkInventoryTransactionModel;
