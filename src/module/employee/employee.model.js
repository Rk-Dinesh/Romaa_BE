import mongoose from "mongoose";

const employeeSchema = new mongoose.Schema(
  {
    employee_id: String,           // Unique employee code (alphanumeric/id generator)
    name: String,                  // Full name
    role: String,                  // Job title/role (e.g., Electrician, Laborer, Supervisor)
    site_assigned: String,         // Site/project code or name employee is assigned to
    status: String,                // e.g., ACTIVE, INACTIVE, ON_LEAVE
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
    id_proof_type: String,        // e.g., Aadhaar, PAN, Driver’s License
    id_proof_number: String,
    created_by_user: String,
  },
  { timestamps: true }
);

const EmployeeModel = mongoose.model("Employees", employeeSchema);

export default EmployeeModel;
