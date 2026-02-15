import mongoose, { Schema } from "mongoose";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
dotenv.config();

const employeeSchema = new mongoose.Schema(
  {
    // --- Identity ---
    employeeId: { type: String, required: true, unique: true }, // EMP-001
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true }, // Login ID
    phone: { type: String, required: true },
    employeeReference: { type: String },

    // --- Security & Auth ---
    password: {
      type: String,
      select: false // Never return password in API queries by default
    },
    refreshToken: { type: String, select: false }, // For session management

    // --- Access Control ---
    role: { type: Schema.Types.ObjectId, ref: "Role", default: null }, // Link to Role Model
    status: {
      type: String,
      enum: ["Active", "Inactive", "Suspended"],
      default: "Active"
    },

    // --- Office / Site Logic ---
    userType: {
      type: String,
      enum: ["Office", "Site"],
      default: "Office"
    },
    shiftType: {
      type: String,
      enum: ["General", "Night", "Morning","Flexible"],
      default: "General"
    },
    assignedProject: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Tenders"
      }
    ],
    accessMode: {
      type: String,
      enum: ["WEBSITE", "MOBILE", "BOTH"],
      default: null
    },
    // --- Profile Details ---
    designation: String,
    dateOfJoining: Date,
    address: {
      street: String,
      city: String,
      state: String,
      pincode: String,
    },
    idProof: {
      type: { type: String }, // e.g., Aadhar, PAN
      number: { type: String }
    },
    emergencyContact: {
      name: String,
      relationship: String,
      phone: String,
    },
    resetOTP: {
      type: String,
      default: null
    },
    resetOTPExpires: {
      type: Date,
      default: null
    },

    // -----------------------------------------------------
    // --- 2. NEW HRMS FIELDS ADDED BELOW ---
    // -----------------------------------------------------

    // --- A. HR & Reporting ---
    photoUrl: { 
      type: String, 
      default: null // URL to AWS S3 / Cloudinary for Mobile App Profile
    },
    department: { 
      type: String 
    },
    reportsTo: { 
      type: Schema.Types.ObjectId, 
      ref: "Employee", // Self-referencing: Links to their Manager for Leave Approvals
      default: null 
    },
    hrStatus: {
      type: String,
      enum: ["Probation", "Confirmed", "Notice Period", "Relieved"],
      default: "Probation"
    },

    // --- B. Leave Management (Current Balance) ---
    leaveBalance: {
      PL: { type: Number, default: 0 }, // Privilege Leave (Resets yearly)
      CL: { type: Number, default: 12 }, // Casual Leave
      SL: { type: Number, default: 12 }, // Sick Leave
      compOff: [
        {
          earnedDate: { type: Date, required: true }, // The holiday they worked
          expiryDate: { type: Date, required: true }, // e.g., earned + 60 days
          isUsed: { type: Boolean, default: false },  // Mark true when availed
          reason: { type: String } // e.g., "Worked on Republic Day"
        }
      ]
    },

    // --- C. Payroll & Bank Details ---
    payroll: {
      basicSalary: { type: Number, default: 0 },
      accountHolderName: { type: String },
      bankName: { type: String },
      accountNumber: { type: String },
      ifscCode: { type: String },
      uanNumber: { type: String }, // For Provident Fund (PF)
      panNumber: { type: String }  // For Tax calculation
    },

  },
  { timestamps: true }
);

// --- Middleware: Hash Password before saving ---
employeeSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

// --- Method: Check Password ---
employeeSchema.methods.isPasswordCorrect = async function (password) {
  return await bcrypt.compare(password, this.password);
};

// --- Method: Generate Access Token ---
employeeSchema.methods.generateAccessToken = function () {
  return jwt.sign(
    {
      _id: this._id,
      email: this.email,
      role: this.role._id || this.role
    },
    process.env.ACCESS_TOKEN_SECRET,
    { expiresIn: process.env.ACCESS_TOKEN_EXPIRY }
  );
};

// --- Method: Generate Refresh Token ---
employeeSchema.methods.generateRefreshToken = function () {
  return jwt.sign(
    { _id: this._id },
    process.env.REFRESH_TOKEN_SECRET,
    { expiresIn: process.env.REFRESH_TOKEN_EXPIRY }
  );
};

const EmployeeModel = mongoose.model("Employee", employeeSchema);

export default EmployeeModel;