import mongoose, { Schema } from "mongoose";

const payrollSchema = new mongoose.Schema(
  {
    employeeId: { 
      type: Schema.Types.ObjectId, 
      ref: "Employee", 
      required: true, 
      index: true 
    },

    // --- Time Period ---
    month: { type: Number, required: true }, // 1 to 12
    year: { type: Number, required: true },  // e.g., 2026

    // --- Attendance & Leave Summary (Fetched from other modules) ---
    attendanceSummary: {
      totalWorkingDays: { type: Number, required: true },
      presentDays: { type: Number, required: true },
      paidLeaves: { type: Number, default: 0 }, // PL, CL, SL taken
      lwp: { type: Number, default: 0 },        // Leave Without Pay days
      overtimeHours: { type: Number, default: 0 }
    },

    // --- Earnings (Income) ---
    earnings: {
      basic: { type: Number, required: true },
      hra: { type: Number, default: 0 }, // House Rent Allowance
      da: { type: Number, default: 0 },  // Dearness Allowance
      overtimePay: { type: Number, default: 0 },
      otherAllowances: { type: Number, default: 0 },
      grossPay: { type: Number, required: true } // Sum of all earnings
    },

    // --- Deductions ---
    deductions: {
      pf: { type: Number, default: 0 },  // Provident Fund
      esi: { type: Number, default: 0 }, // Employee State Insurance
      tax: { type: Number, default: 0 }, // TDS / Income Tax
      lwpDeduction: { type: Number, default: 0 }, // Calculated based on LWP days
      totalDeductions: { type: Number, required: true } // Sum of all deductions
    },

    // --- Final Payout ---
    netPay: { 
      type: Number, 
      required: true // grossPay - totalDeductions
    },

    // --- Payout Status & Assets ---
    status: {
      type: String,
      enum: ["Pending", "Processed", "Paid"],
      default: "Pending"
    },
    paymentDate: { type: Date, default: null },
    transactionId: { type: String, default: null }, // Bank NEFT/RTGS ID

    payslipUrl: { 
      type: String, 
      default: null // AWS S3 URL to the generated PDF payslip
    }
  },
  { timestamps: true }
);

// Compound Index: Ensures one payroll document per employee per month
payrollSchema.index({ employeeId: 1, month: 1, year: 1 }, { unique: true });

export const PayrollModel = mongoose.model("Payroll", payrollSchema);


// 🧠 How the Monthly "One-Click Payroll" works:
// On the 1st of every month, your backend script will run this automated workflow:

// Lock Data: Check how many days the employee was Present, Absent, and On LWP from the Attendance and Leave collections.

// Calculate Deductions: If lwp = 2, the formula (Basic / 30) * 2 calculates the lwpDeduction.

// Generate Document: Saves this final document into the database with "Pending" status.

// PDF & Payout: Once HR clicks "Process", it generates PDF payslips and creates the Excel file for the bank.