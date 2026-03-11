import mongoose from "mongoose";

const workEntrySchema = new mongoose.Schema({
  description: { type: String,  },
  category: { type: String },
  l: { type: Number, default: 0 },
  b: { type: Number, default: 0 },
  h: { type: Number, default: 0 },
  quantity: { type: Number, default: 0 },
  unit: { type: String, default: "CUM" },
  
  // Worker Specifics
  worker_id: { type: String, required: true },
  worker_name: { type: String },
  status: { 
    type: String, 
    enum: ["PRESENT", "ABSENT", "HALF_DAY"], 
    default: "PRESENT" 
  },
  daily_wage: { type: Number, default: 0 } ,
  remark: { type: String ,default: "No Remark"},
}, { _id: false });

const DailyLabourReportSchema = new mongoose.Schema(
  {
    report_date: { type: Date, required: true, index: true },
    project_id: { type: String, required: true, index: true },
    contractor_id: { type: String, required: true, index: true },
    
    work_entries: [workEntrySchema], // Changed to match your middleware loop

    grand_total_headcount: { type: Number, default: 0 },
    grand_total_amount: { type: Number, default: 0 },
    
    status: { type: String, enum: ["PENDING", "APPROVED", "REJECTED"], default: "PENDING" },
    remark: { type: String ,default: "No Remark"},
    created_by: String
  },
  { timestamps: true }
);

// --- FIXES APPLIED IN MIDDLEWARE ---
DailyLabourReportSchema.pre("save", function (next) {
  let totalHeadcount = 0;
  let totalAmount = 0;

  // 1. Fixed the reference: changed 'this.tasks' to 'this.work_entries'
  this.work_entries.forEach(entry => {
    
    // 2. Quantity Calculation
    // Ensure we handle 0 values correctly to avoid breaking the math
    if (entry.l || entry.b || entry.h) {
      entry.quantity = (entry.l || 1) * (entry.b || 1) * (entry.h || 1);
    }

    // 3. Attendance & Wage Calculation Logic
    if (entry.status === "PRESENT") {
      totalHeadcount += 1;
      totalAmount += entry.daily_wage;
    } else if (entry.status === "HALF_DAY") {
      totalHeadcount += 0.5;
      totalAmount += (entry.daily_wage / 2);
    }
    // ABSENT counts as 0 for both
  });

  this.grand_total_headcount = totalHeadcount;
  this.grand_total_amount = totalAmount;
  
  next();
});

const DLRModel = mongoose.model("DailyLabourReport", DailyLabourReportSchema);
export default DLRModel;