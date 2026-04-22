import mongoose from "mongoose";
import { auditPlugin } from "../../audit/auditlog.plugin.js";

const vendorSchema = new mongoose.Schema(
  {
    vendor_id: { type: String, unique: true },          // Unique vendor identifier
    company_name: { type: String, required: true },     // Registered vendor/business name
    contact_person: { type: String, required: true },   // Main point of contact
    contact_phone: String,                              // Main/contact phone number
    contact_email: String,
    address: {
      street: String,
      city: String,
      state: String,
      country: String,
      pincode: String,
    },
    gstin: String,                  // GSTIN or tax/VAT number
    pan_no: String,                 // PAN or local tax ID
    type: String,                   // Material, Service, Equipment, Subcontractor, etc.
    materials_supplied: [String],   // List of materials/services they offer
    bank_details: {
      account_name: String,
      account_number: String,
      bank_name: String,
      ifsc_code: String,
      branch: String
    },
   
    status: String,                  // ACTIVE, INACTIVE, BLACKLISTED, etc.
    documents: [
      {
        doc_type: String,            // e.g., Agreement, Compliance, License
        doc_url: String,             // File storage or link
        uploaded_at: Date
      }
    ],
    place_of_supply: {type:String, enum: ['InState',  'Others']},
    credit_day: { type: Number },                // Payment credit period in days
    created_by_user: String,         // For admin log/audit
  },
  { timestamps: true }
);

vendorSchema.plugin(auditPlugin, { entity_type: "Vendor", entity_no_field: "vendor_id" });

const VendorModel = mongoose.model("Vendors", vendorSchema);

export default VendorModel;
