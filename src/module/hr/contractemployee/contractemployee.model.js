import mongoose from "mongoose";

const dailyAttendanceSchema = new mongoose.Schema(
  {
    date: { type: Date, required: true },       // Attendance date
    present: { type: Boolean, required: true }, // True=Present, False=Absent
    remarks: String                             // Optional: half-day, overtime, etc.
  },
  { _id: false }
);

const contractWorkerSchema = new mongoose.Schema(
  {
    worker_id: { type: String, unique: true },
    employee_name: { type: String, required: true },
    contractor_name: String,
    site_assigned: String,
    department: String,                       // e.g., Civil, Electrical, Plumbing
    role: String,                             // e.g., Mason, Helper, Fitter
    nmr_number: String,                       // Nominal Muster Roll No.
    daily_wage: String,
    status: String,                           // ACTIVE, INACTIVE, LEFT, etc.
    contact_phone: String,
    gender: String,
    age: Number,
    address: {
      street: String,
      city: String,
      state: String,
      country: String,
      pincode: String,
    },
    id_proof_type: String,
    id_proof_number: String,
    daily_attendance: [dailyAttendanceSchema],
    created_by_user: String,
  },
  { timestamps: true }
);

const ContractWorkerModel = mongoose.model("ContractWorkers", contractWorkerSchema);

export default ContractWorkerModel;


// await ContractWorkerModel.updateOne(
//   { worker_id: "CW123", "daily_attendance.date": { $ne: new Date("2025-08-04") } },
//   { $push: { daily_attendance: { date: "2025-08-04", present: true } } }
// );

