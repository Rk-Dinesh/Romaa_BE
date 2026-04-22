import mongoose, { Schema } from "mongoose";
import { auditPlugin } from "../../audit/auditlog.plugin.js";

const hsnSacMasterSchema = new Schema(
  {
    // --- 1. Core Identifiers ---
    code: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      index: true, // Indexed for fast search during billing/invoicing
    },
    type: {
      type: String,
      enum: ["HSN", "SAC"],
      required: true,
      index: true, // Helpful if you need to filter only Goods or only Services
    },
    
    // --- 2. Descriptive Details ---
    description: {
      type: String,
      required: true,
      trim: true,
    },
    shortDescription: {
      type: String,
      trim: true,
      maxLength: 100, // Useful for tight UI spaces like dropdowns
    },

    // --- 3. Tax Structure (e.g., GST) ---
    // Storing rates directly on the master saves complex joins during invoice creation
    taxStructure: {
      igst: { type: Number, required: true, min: 0, default: 0 }, // Integrated GST (e.g., 18)
      cgst: { type: Number, required: true, min: 0, default: 0 }, // Central GST (e.g., 9)
      sgst: { type: Number, required: true, min: 0, default: 0 }, // State GST (e.g., 9)
      cess: { type: Number, min: 0, default: 0 },                 // Additional Cess if applicable
    },

    // --- 4. Configuration & Compliance ---
    defaultUom: {
      type: String,
      trim: true,
      // Optional: Reference to a UOM master if you have one
      // type: Schema.Types.ObjectId, ref: 'UomMaster'
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    
    // --- 5. Tracking (Optional but recommended) ---
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User", // Or "Employee" based on your auth schema
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    }
  },
  { 
    timestamps: true // Automatically handles createdAt and updatedAt
  }
);

// ⚡ Compound index for searching active codes of a specific type
hsnSacMasterSchema.index({ type: 1, isActive: 1 });

hsnSacMasterSchema.plugin(auditPlugin, { entity_type: "HsnSac", entity_no_field: "code" });

const HsnSacMasterModel = mongoose.model("HsnSacMaster", hsnSacMasterSchema);
export default HsnSacMasterModel;