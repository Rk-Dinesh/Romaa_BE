import mongoose, { Schema } from "mongoose";
import { auditPlugin } from "../../audit/auditlog.plugin.js";

// HR-controlled department directory.
// Matches Employee.department by `name` (string match) so existing employee
// records keep working without a data migration. `headId` is the HOD whom
// the leave-approval flow routes to as the middle stage between Manager
// and HR when the active LeavePolicyRule sets `requiresHODApproval: true`.
const DepartmentSchema = new Schema(
  {
    name: { type: String, required: true, unique: true, trim: true, index: true },
    code: { type: String, trim: true, uppercase: true }, // e.g. "ENG", "OPS"
    headId: { type: Schema.Types.ObjectId, ref: "Employee", default: null, index: true },
    // Optional org-chart parent for nested hierarchies (HOD of HOD).
    parentDepartmentId: { type: Schema.Types.ObjectId, ref: "Department", default: null },
    description: { type: String },
    isActive: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "Employee", default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: "Employee", default: null },
  },
  { timestamps: true },
);

DepartmentSchema.plugin(auditPlugin, { entity_type: "Department" });

const DepartmentModel = mongoose.model("Department", DepartmentSchema);
export default DepartmentModel;
