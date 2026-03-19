import mongoose from "mongoose";

const NMRSchema = new mongoose.Schema(
  {
    attendance_date: { type: Date, required: true, index: true },
    project_id: { type: String, required: true, index: true },
    contractor_id: { type: String, required: true, index: true }, // Links to Contractor

    attendance_list: [
      {
        worker_id: { type: String, required: true }, // FK to ContractWorker
        worker_name: { type: String },
        category: { type: String }, // Mason, Helper, etc.
        status: {
          type: String,
          enum: ["PRESENT", "ABSENT", "HALF_DAY","QUARTER_DAY"],
          default: "PRESENT",
        },
        in_time: String,
        out_time: String,
        daily_wage: { type: Number, default: 0 }, // Snapshotted from Contractor.wage_fixing
      },
    ],

    total_present: { type: Number, default: 0 },
    total_payable_amount: { type: Number, default: 0 },
    
    verified_by: String, // Supervisor/Manager ID
    status: { type: String, enum: ["SUBMITTED", "APPROVED"], default: "SUBMITTED" }
  },
  { timestamps: true }
);

// Middleware to calculate payroll totals for the day
NMRSchema.pre("save", function (next) {
  let presentCount = 0;
  let amount = 0;

  this.attendance_list.forEach((w) => {
    if (w.status === "PRESENT") {
      presentCount += 1;
      amount += w.daily_wage;
    } else if (w.status === "HALF_DAY") {
      presentCount += 0.5;
      amount += w.daily_wage / 2;
    } else if (w.status === "QUARTER_DAY") {
      presentCount += 0.25;
      amount += w.daily_wage / 4;
    }
  });

  this.total_present = presentCount;
  this.total_payable_amount = amount;
  next();
});

const NMRAttendanceModel = mongoose.model("NMR_Attendance", NMRSchema);
export default NMRAttendanceModel;