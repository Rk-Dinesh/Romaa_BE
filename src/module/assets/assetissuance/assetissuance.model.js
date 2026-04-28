import mongoose, { Schema } from "mongoose";
import { auditPlugin } from "../../audit/auditlog.plugin.js";

// AssetIssuance — cross-cutting custody log.
// Tracks who has what, when issued, when due back, condition on hand-over and
// return, with handover proof (signed photo / digital signature).
//
// Polymorphic asset reference:
//   asset_kind = "TAGGED"  →  asset_ref → TaggedAsset      (qty always 1)
//   asset_kind = "BULK"    →  asset_ref → BulkInventory    (qty 1..N)
//   asset_kind = "MACHINERY" → asset_ref → MachineryAsset  (qty 1, operator handover)
//
// For BULK issuances, the underlying stock movement is posted by
// BulkInventoryService.issue / .receiveReturn — this record is the human-side
// custody trail, not the stock ledger.

const AssetIssuanceSchema = new mongoose.Schema(
  {
    issue_id: { type: String, required: true, unique: true, index: true }, // e.g. "ISS001"

    // Polymorphic asset reference
    asset_kind: {
      type: String,
      enum: ["TAGGED", "BULK", "MACHINERY"],
      required: true,
      index: true,
    },
    asset_ref: { type: Schema.Types.ObjectId, required: true, index: true },
    asset_id_label: { type: String, required: true, index: true }, // human ID e.g. "TGA001"
    asset_name: { type: String, trim: true },

    // Recipient
    assigned_to_kind: {
      type: String,
      enum: ["EMPLOYEE", "CONTRACTOR", "CONTRACT_WORKER", "SITE"],
      required: true,
      index: true,
    },
    assigned_to_id: { type: String, required: true, index: true }, // EMP-001 / CON-001 etc.
    assigned_to_name: { type: String, required: true },
    contractor_id: { type: String }, // optional — if contract worker, parent contractor

    // Site context — useful for site-level reports even when assigned to a person
    project_id: { type: String, trim: true, index: true },
    site_name: { type: String, trim: true },

    quantity: { type: Number, default: 1, min: 1 }, // 1 for tagged/machinery, N for bulk

    // Dates
    issue_date: { type: Date, default: Date.now, index: true },
    expected_return_date: { type: Date, index: true },
    actual_return_date: { type: Date, index: true },

    // Conditions
    condition_on_issue: {
      type: String,
      enum: ["NEW", "GOOD", "FAIR", "POOR", "DAMAGED"],
      default: "GOOD",
    },
    condition_on_return: {
      type: String,
      enum: ["NEW", "GOOD", "FAIR", "POOR", "DAMAGED", null],
      default: null,
    },
    damage_charge: { type: Number, default: 0, min: 0 },

    status: {
      type: String,
      enum: ["ISSUED", "PARTIALLY_RETURNED", "RETURNED", "OVERDUE", "LOST", "DAMAGED"],
      default: "ISSUED",
      index: true,
    },

    // For BULK partial returns
    quantity_returned: { type: Number, default: 0, min: 0 },

    purpose: String,

    // Handover proof
    handover_signature_url: String,
    handover_photo_url: String,
    return_signature_url: String,
    return_photo_url: String,

    notes: String,

    issued_by: { type: Schema.Types.ObjectId, ref: "Employee" },
    received_by: { type: Schema.Types.ObjectId, ref: "Employee" }, // who recorded the return
  },
  { timestamps: true }
);

AssetIssuanceSchema.index({ assigned_to_id: 1, status: 1 });
AssetIssuanceSchema.index({ project_id: 1, status: 1 });
AssetIssuanceSchema.index({ status: 1, expected_return_date: 1 }); // overdue scans

AssetIssuanceSchema.plugin(auditPlugin, {
  entity_type: "AssetIssuance",
  entity_no_field: "issue_id",
});

const AssetIssuanceModel = mongoose.model("AssetIssuance", AssetIssuanceSchema);
export default AssetIssuanceModel;
