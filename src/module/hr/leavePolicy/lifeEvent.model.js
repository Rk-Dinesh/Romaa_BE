import mongoose, { Schema } from "mongoose";
import { auditPlugin } from "../../audit/auditlog.plugin.js";

// Records a life event that triggers an EVENT_TRIGGERED leave grant.
// Idempotency: unique on (employeeId, eventType, eventDate) so the same
// event isn't double-credited.
const LifeEventSchema = new Schema(
  {
    employeeId: { type: Schema.Types.ObjectId, ref: "Employee", required: true, index: true },
    eventType: {
      type: String,
      enum: ["ChildBirth", "Death", "Marriage", "Adoption", "Other"],
      required: true,
    },
    eventDate: { type: Date, required: true },
    docsUrl:   { type: String },           // S3 URL to supporting document
    notes:     { type: String },
    grantedLeaveType: { type: String },    // e.g. "Maternity"
    grantedDays:      { type: Number, default: 0 },
    recordedBy: { type: Schema.Types.ObjectId, ref: "Employee", default: null },
  },
  { timestamps: true },
);

LifeEventSchema.index({ employeeId: 1, eventType: 1, eventDate: 1 }, { unique: true });

LifeEventSchema.plugin(auditPlugin, { entity_type: "LifeEvent" });

const LifeEventModel = mongoose.model("LifeEvent", LifeEventSchema);
export default LifeEventModel;
