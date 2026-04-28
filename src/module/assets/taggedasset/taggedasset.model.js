import mongoose, { Schema } from "mongoose";
import { auditPlugin } from "../../audit/auditlog.plugin.js";

// TaggedAsset — per-unit serial-tracked assets that are NOT machinery/vehicles.
// Covers: Tools, IT equipment, Survey instruments, Furniture, individual SiteInfra
// units (cabins, containers, watch towers). Anything tracked one-by-one with a
// serial number, custodian, and condition. Use MachineryAsset for items needing
// GPS/fuel/HMR/KMs tracking; use BulkInventory for quantity-based stock.

const TaggedAssetSchema = new mongoose.Schema(
  {
    // --- 1. Identity ---
    asset_id: { type: String, required: true, unique: true, index: true }, // e.g. "TGA001"
    asset_name: { type: String, required: true, trim: true },

    // --- 2. Classification (links to AssetCategoryMaster, denormalized for fast filter) ---
    asset_category_ref: { type: Schema.Types.ObjectId, ref: "AssetCategoryMaster", required: true, index: true },
    asset_class: {
      type: String,
      enum: ["Tool", "IT", "Survey", "Furniture", "SiteInfra", "SafetyEquipment", "Other"],
      required: true,
      index: true,
    },
    category: { type: String, trim: true, index: true },
    sub_category: { type: String, trim: true },

    // --- 3. Ownership ---
    ownership: {
      type: String,
      enum: ["OWNED", "RENTED", "LEASED"],
      default: "OWNED",
      index: true,
    },
    vendor_id: { type: String, trim: true },
    vendor_name: { type: String, trim: true },
    rental_per_day: { type: Number, min: 0 },
    rental_start_date: Date,
    rental_end_date: Date,

    // --- 4. Technical Specs ---
    serial_number: { type: String, trim: true, index: true },
    model_number: { type: String, trim: true },
    manufacturer: { type: String, trim: true },
    manufacturing_year: { type: Number, min: 1900, max: 2100 },
    specifications: { type: Schema.Types.Mixed }, // flexible: color/size/capacity/voltage etc.

    // --- 5. Purchase / Warranty ---
    purchase_date: Date,
    purchase_cost: { type: Number, min: 0 },
    supplier_name: { type: String, trim: true },
    invoice_number: { type: String, trim: true },
    warranty: {
      starts_on: Date,
      expires_on: Date,
      vendor: String,
      coverage: String,
    },

    // --- 6. Current Custody / Location ---
    current_location_type: {
      type: String,
      enum: ["SITE", "STORE", "ASSIGNED", "TRANSIT", "VENDOR"],
      default: "STORE",
      index: true,
    },
    current_site_id: { type: String, trim: true, index: true }, // projectId
    current_site_name: { type: String, trim: true },
    current_store_name: { type: String, trim: true },
    assigned_to_employee_id: { type: String, trim: true, index: true }, // EMP-001
    assigned_to_employee_name: { type: String, trim: true },

    // --- 7. Operational Status & Condition ---
    status: {
      type: String,
      enum: ["ACTIVE", "IN_STORE", "ISSUED", "UNDER_REPAIR", "LOST", "SCRAPPED"],
      default: "IN_STORE",
      index: true,
    },
    condition: {
      type: String,
      enum: ["NEW", "GOOD", "FAIR", "POOR", "DAMAGED"],
      default: "NEW",
    },

    // --- 8. Calibration / Compliance summary (mainly for Survey, Lab, PPE) ---
    compliance: {
      requires_calibration: { type: Boolean, default: false },
      last_calibration_date: Date,
      next_calibration_due: { type: Date, index: true }, // for due alerts
      last_certificate_number: String,
      last_certificate_url: String,
    },

    // --- 9. Documents (Invoice, Warranty Card, Manuals, Certs) ---
    documents: [
      {
        doc_type: { type: String, enum: ["Invoice", "Warranty", "Manual", "Certificate", "Other"] },
        doc_number: String,
        expiry_date: Date,
        file_url: String,
        uploaded_at: { type: Date, default: Date.now },
      },
    ],

    // --- 10. Photos & Tagging ---
    photos: [String], // S3 URLs
    qr_code: { type: String, trim: true, index: true }, // for QR-scan-based check-in/out
    rfid_tag: { type: String, trim: true },

    notes: String,

    // --- 11. Soft delete + audit ---
    is_deleted: { type: Boolean, default: false, index: true },
    created_by: { type: Schema.Types.ObjectId, ref: "Employee" },
    updated_by: { type: Schema.Types.ObjectId, ref: "Employee" },
  },
  { timestamps: true }
);

// Compound indexes for common dashboards
TaggedAssetSchema.index({ asset_class: 1, status: 1 });
TaggedAssetSchema.index({ current_site_id: 1, status: 1 });
TaggedAssetSchema.index({ "compliance.next_calibration_due": 1 });
TaggedAssetSchema.index({ is_deleted: 1, status: 1 });

TaggedAssetSchema.plugin(auditPlugin, {
  entity_type: "TaggedAsset",
  entity_no_field: "asset_id",
});

const TaggedAssetModel = mongoose.model("TaggedAsset", TaggedAssetSchema);
export default TaggedAssetModel;
