import mongoose, { Schema } from "mongoose";
import { auditPlugin } from "../../audit/auditlog.plugin.js";

// HR-controlled weekly-off rules per department.
//
// Each rule pins a day-of-week (0=Sun..6=Sat). If `weeks` is empty, the rule
// applies to every occurrence of that DOW in the month. If `weeks` contains
// one or more of [1,2,3,4,5], it applies only on those week-of-month indices.
//
// Examples:
//   weeklyOffs: [{ dow: 0 }]                          // every Sunday only
//   weeklyOffs: [{ dow: 0 }, { dow: 6 }]              // Sat + Sun
//   weeklyOffs: [{ dow: 0 }, { dow: 6, weeks: [2,4] }] // Sun + 2nd/4th Sat (legacy default)
//   weeklyOffs: [{ dow: 0 }, { dow: 6, weeks: [1,3,5] }] // alternate weeks
//
// Resolution order in CalendarService.checkDayStatus:
//   1) policy where { department: <employee.department>, isActive: true }
//   2) policy where { department: "DEFAULT", isActive: true }
//   3) hardcoded fallback (Sun off + 2nd/4th Sat off) — keeps current behaviour
//      working until HR seeds a DEFAULT row.
const WeeklyOffRuleSchema = new Schema(
  {
    dow:   { type: Number, min: 0, max: 6, required: true },
    weeks: [{ type: Number, min: 1, max: 5 }],
    label: { type: String },
  },
  { _id: false },
);

const WeeklyOffPolicySchema = new Schema(
  {
    // "DEFAULT" is a reserved sentinel used as the fallback for all
    // departments that don't have their own row.
    department: { type: String, required: true, unique: true, trim: true, index: true },
    weeklyOffs: { type: [WeeklyOffRuleSchema], default: [] },
    isActive: { type: Boolean, default: true },
    notes: { type: String },
    createdBy: { type: Schema.Types.ObjectId, ref: "Employee", default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: "Employee", default: null },
  },
  { timestamps: true },
);

WeeklyOffPolicySchema.plugin(auditPlugin, { entity_type: "WeeklyOffPolicy" });

const WeeklyOffPolicyModel = mongoose.model("WeeklyOffPolicy", WeeklyOffPolicySchema);
export default WeeklyOffPolicyModel;
