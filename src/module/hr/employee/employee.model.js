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
    
    // --- Security & Auth ---
    password: { 
      type: String, 
      select: false // Never return password in API queries by default
    },
    refreshToken: { type: String, select: false }, // For session management
    
    // --- Access Control ---
    role: { type: Schema.Types.ObjectId, ref: "Role",default: null }, // Link to Role Model
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
    // If userType is "Site", link them to a specific project so they can only see that data
    assignedProject: { type: Schema.Types.ObjectId, ref: "Tenders", default: null },
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
      type: { type: String },
      number: { type: String }
    },
    emergencyContact: {
      name: String,
      relationship: String,
      phone: String,
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
    { expiresIn: process.env.ACCESS_TOKEN_EXPIRY } // e.g., "15m"
  );
};

// --- Method: Generate Refresh Token ---
employeeSchema.methods.generateRefreshToken = function () {
  return jwt.sign(
    { _id: this._id },
    process.env.REFRESH_TOKEN_SECRET,
    { expiresIn: process.env.REFRESH_TOKEN_EXPIRY } // e.g., "7d"
  );
};

const EmployeeModel = mongoose.model("Employee", employeeSchema);

export default EmployeeModel;
