import mongoose from "mongoose";

// 1. Work Progress (The "What" was done)
const workEntrySchema = new mongoose.Schema({
  description: { type: String, required: true },
  category: { type: String, required: true }, // Mason, Helper, etc.
  l: { type: Number, default: 0 },
  b: { type: Number, default: 0 },
  h: { type: Number, default: 0 },
  quantity: { type: Number, default: 0 },
  unit: { type: String, default: "CUM" },
  remark: { type: String, default: "No Remark" },
  totalHeads: { type: Number, default: 0 },
  totalAmount: { type: Number, default: 0 },
}, { _id: false });

// 2. Attendance (The "Who" did it & "How Much" to pay)
const attendanceEntrySchema = new mongoose.Schema({
  worker_id: { type: String, required: true },
  worker_name: { type: String },
  category: { type: String }, 
  status: { 
    type: String, 
    enum: ["PRESENT", "ABSENT", "HALF_DAY"], 
    default: "PRESENT" 
  },
  daily_wage: { type: Number, default: 0 }, // Captured from Contractor's wage_fixing
  remark: { type: String, default: "" },
}, { _id: false });

const DailyLabourReportSchema = new mongoose.Schema(
  {
    report_date: { type: Date, required: true, index: true },
    project_id: { type: String, required: true, index: true },
    contractor_id: { type: String, required: true, index: true },
    
    // Separate arrays inside the same model
    work_entries: [workEntrySchema], 
    attendance_entries: [attendanceEntrySchema],

    // Grand Totals (Calculated from attendance_entries)
    grand_total_qty: { type: Number, default: 0 },
    grand_total_man_days: { type: Number, default: 0 }, 
    grand_total_amount: { type: Number, default: 0 },    
    
    status: { type: String, enum: ["PENDING", "APPROVED", "REJECTED"], default: "PENDING" },
    remark: { type: String, default: "No Remark" },
    created_by: String
  },
  { timestamps: true }
);

// --- THE CONTROL LOGIC (Middleware) ---
DailyLabourReportSchema.pre("save", function (next) {
  let totalQty = 0;
  let totalHeads = 0;
  let totalAmt = 0;

  // A. Calculate Progress Quantities
  this.work_entries.forEach(entry => {
    if (entry.l || entry.b || entry.h) {
      entry.quantity = (entry.l || 1) * (entry.b || 1) * (entry.h || 1);
      totalQty += entry.quantity;
    }
  });

  // B. Calculate Financials & Man-days (Based strictly on Attendance)
  this.attendance_entries.forEach(att => {
    if (att.status === "PRESENT") {
      totalHeads += 1;
      totalAmt += (att.daily_wage || 0);
    } else if (att.status === "HALF_DAY") {
      totalHeads += 0.5;
      totalAmt += (att.daily_wage || 0) / 2;
    }
    // ABSENT counts as 0
  });

  this.grand_total_qty = totalQty;
  this.grand_total_man_days = totalHeads;
  this.grand_total_amount = totalAmt;
  
  next();
});

const DLRModel = mongoose.model("DailyLabourReport", DailyLabourReportSchema);
export default DLRModel;