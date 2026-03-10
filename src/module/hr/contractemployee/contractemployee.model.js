import mongoose from "mongoose";

const contractWorkerSchema = new mongoose.Schema(
  {
    worker_id: { type: String, unique: true, required: true },
    contractor_id: { type: String, required: true, index: true }, // FK → Contractor

    // --- Basic Info ---
    employee_name: { type: String, required: true },
    contact_phone: { type: String },
    gender: { type: String },
    age: { type: Number },
    address: {
      street: String,
      city: String,
      state: String,
      country: String,
      pincode: String,
    },

    // --- ID Proof ---
    id_proof_type: { type: String },
    id_proof_number: { type: String },
    photo: { type: String }, // S3 key

    // --- Assignment ---
    site_assigned: { type: String },
    role: { type: String }, // Mason, Helper, Fitter
    daily_wage: { type: Number, default: 0 },

    status: {
      type: String,
      enum: ["ACTIVE", "INACTIVE", "LEFT"],
      default: "ACTIVE",
    },
    created_by_user: { type: String },
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

contractWorkerSchema.index({ isDeleted: 1, contractor_id: 1 });
contractWorkerSchema.index({ isDeleted: 1, status: 1 });

const ContractWorkerModel = mongoose.model(
  "ContractWorkers",
  contractWorkerSchema
);

export default ContractWorkerModel;
