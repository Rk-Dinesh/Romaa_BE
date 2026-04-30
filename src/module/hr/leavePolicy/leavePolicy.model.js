import mongoose, { Schema } from "mongoose";
import { auditPlugin } from "../../audit/auditlog.plugin.js";

// HR-controlled leave policy.
// One row per scope (DEFAULT or department-name). Effective-dated so HR can
// publish "Standard 2027" alongside "Standard 2026" without overwriting.
//
// Resolution at runtime (LeavePolicyService.resolveForEmployee):
//   1) row where { scope: <employee.department>, isActive: true,
//                 effectiveFrom <= now <= effectiveTo (or null) }
//   2) row where { scope: "DEFAULT", isActive: true, effectiveFrom <= now... }
//   3) null → callers fall back to legacy hardcoded numbers (12/12/30/...).

const LeavePolicyRuleSchema = new Schema(
  {
    leaveType: {
      type: String,
      enum: ["CL", "SL", "PL", "Maternity", "Paternity", "Bereavement", "CompOff", "Permission", "LWP"],
      required: true,
    },

    // How the balance is replenished.
    refillType: {
      type: String,
      enum: [
        "ANNUAL_RESET",
        "MONTHLY_ACCRUAL",
        "QUARTERLY_ACCRUAL",
        "EVENT_TRIGGERED",
        "EARNED",
        "MONTHLY_RESET",
        "TENURE_BASED",
        "PRO_RATED_HIRE",
        "MANUAL_ONLY",
      ],
      default: "ANNUAL_RESET",
    },

    // Yearly target (used by ANNUAL_RESET, MONTHLY_ACCRUAL cap, ProRata math).
    annualEntitlement: { type: Number, default: 0 },

    // Per-period credit (used by MONTHLY_ACCRUAL / QUARTERLY_ACCRUAL).
    accrualPerPeriod: { type: Number, default: 0 },

    // Tenure slabs override annualEntitlement when provided.
    // Pick the highest slab whose minMonths <= service.
    tenureSlabs: [{
      minMonths: { type: Number, required: true },
      entitlement: { type: Number, required: true },
    }],

    // Carry-forward & encashment
    carryForwardCap: { type: Number, default: 0 },
    encashable: { type: Boolean, default: false },
    encashmentBasis: { type: String, enum: ["BASIC", "GROSS", "FIXED"], default: "BASIC" },
    encashmentRatePerDay: { type: Number, default: 0 }, // used when basis=FIXED

    // Eligibility / validation
    probationEligible:    { type: Boolean, default: true },
    proRataForNewJoiners: { type: Boolean, default: true },
    maxConsecutiveDays:   { type: Number },                 // null = no cap
    minNoticeDays:        { type: Number, default: 0 },
    docsRequiredAfterDays:{ type: Number },                 // null = never
    monthlyCap:           { type: Number },                 // Permission: 3/mo etc.
    validityDays:         { type: Number },                 // CompOff: 60d etc.

    // Approval matrix (consumed by leave approvals — see LP suggestions)
    requiresManagerApproval: { type: Boolean, default: true },
    requiresHODApproval:     { type: Boolean, default: false }, // H2: opt-in
    hodMinDays:              { type: Number, default: 0 },      // 0 = always when requiresHODApproval=true
    requiresHRApproval:      { type: Boolean, default: true },
    autoApproveUnderDays:    { type: Number, default: 0 },  // 0 = never auto-approve
    escalationAfterHours:    { type: Number, default: 0 },  // 0 = no SLA escalation

    // Operational guards
    blackoutDates: [{
      from:  { type: Date, required: true },
      to:    { type: Date, required: true },
      reason:{ type: String },
    }],
  },
  { _id: false },
);

const LeavePolicySchema = new Schema(
  {
    policyName: { type: String, required: true, trim: true },
    scope:      { type: String, required: true, trim: true, index: true }, // "DEFAULT" or department
    effectiveFrom: { type: Date, required: true, default: () => new Date() },
    effectiveTo:   { type: Date, default: null }, // null = open-ended
    isActive:      { type: Boolean, default: true, index: true },
    rules: { type: [LeavePolicyRuleSchema], default: [] },
    notes: { type: String },
    createdBy: { type: Schema.Types.ObjectId, ref: "Employee", default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: "Employee", default: null },
  },
  { timestamps: true },
);

LeavePolicySchema.index({ scope: 1, isActive: 1, effectiveFrom: -1 });

LeavePolicySchema.plugin(auditPlugin, { entity_type: "LeavePolicy" });

const LeavePolicyModel = mongoose.model("LeavePolicy", LeavePolicySchema);
export default LeavePolicyModel;
