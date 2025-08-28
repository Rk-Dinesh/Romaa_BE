import mongoose from "mongoose";

const vendorSchema = new mongoose.Schema({
  vendor_id: String,
  type: String,
  vendor_name: String,
  agreement_start: Date,
  agreement_end: Date,
  permitted_by: String,
  permitted_status: String,
  remarks: String,
});

const vendorPermittedSchema = new mongoose.Schema({
  tender_id: String,
  listOfPermittedVendors: [vendorSchema],
});


const VendorPermittedModel = mongoose.model("vendorPermitted", vendorPermittedSchema);

export default VendorPermittedModel;
