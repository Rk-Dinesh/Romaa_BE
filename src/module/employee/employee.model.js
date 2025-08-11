import mongoose from "mongoose";

const dailyAttendanceSchema = new mongoose.Schema(
  {
    date: { type: Date, required: true },       // The day attendance is recorded
    present: { type: Boolean, required: true }, // true = Present, false = Absent
    remarks: String                             // Optional: late, leave, overtime, etc.
  },
  { _id: false }
);

const employeeSchema = new mongoose.Schema(
  {
    employee_id: { type: String, unique: true },
    name: { type: String, required: true },
    role: String,                  
    site_assigned: String,         
    status: String,                
    contact_phone: String,
    contact_email: String,
    address: {
      street: String,
      city: String,
      state: String,
      country: String,
      pincode: String,
    },
    date_of_joining: Date,
    emergency_contact: {
      name: String,
      relationship: String,
      phone: String,
    },
    id_proof_type: String,        
    id_proof_number: String,
    created_by_user: String,

    // 📅 Attendance Added
    daily_attendance: [dailyAttendanceSchema],
  },
  { timestamps: true }
);

const EmployeeModel = mongoose.model("Employees", employeeSchema);

export default EmployeeModel;
