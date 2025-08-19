import mongoose from "mongoose";

const contractorSchema = new mongoose.Schema(
  {
    contractor_id: { type: String, unique: true, required: true },  // Unique contractor identifier
    company_name: { type: String, required: true },
    contact_person: String,           // Name of primary contact at contractor company
    contact_phone: String,
    contact_email: String,
    address: {
      street: String,
      city: String,
      state: String,
      country: String,
      pincode: String,
    },
    business_type: String,            // e.g., Civil, Electrical, Plumbing, etc.
    license_number: String,           // Registration or license number of contractor
    contract_start_date: Date,
    contract_end_date: Date,
    status: {                         // e.g., ACTIVE, INACTIVE, SUSPENDED, BLACKLISTED
      type: String,
      default: "ACTIVE"
    },
    remarks: String,                  // Additional notes or remarks
    created_by_user: String,
  },
  { timestamps: true }
);

const ContractorModel = mongoose.model("Contractors", contractorSchema);

export default ContractorModel;
