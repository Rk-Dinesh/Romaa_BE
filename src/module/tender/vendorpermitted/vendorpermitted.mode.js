import mongoose from "mongoose";

const vendorPermittedSchema = new mongoose.Schema({
  tender_id: String,
  listOfPermittedVendors: [
    {
      vendor_id: String,
      type:String,
      vendor_name: String,
      agreement_start: Date, // Date of onboarding or agreement
      agreement_end: Date, // Date of agreement expiry (if any)
      permitted_by: String,
      permitted_status: String, // e.g., APPROVED, PENDING, REJECTED
      remarks: String, // Optional remarks for the permission
    },
  ],
});

const VendorPermittedModel = mongoose.model("vendorPermitted", vendorPermittedSchema);

export default VendorPermittedModel;
