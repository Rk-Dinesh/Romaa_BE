import mongoose from "mongoose";
import { auditPlugin } from "../audit/auditlog.plugin.js";

const UserSchema = new mongoose.Schema(
  {
    user_id: { type: String, required: true },
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    mobile: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    city: { type: String },
    country: { type: String },
    pincode: { type: String },
    state: { type: String },
    address: { type: String },
    bloodGroup: { type: String },
    password: { type: String ,required: true },
    level: { type: String },
    roleId: { type: String},
    emailStatus: { type: String, default: "PENDING" },
    status: { type: String, default: "ACTIVE" },
    refreshToken: { type: String },
    lastLogin: { type: Number },
  },
  { timestamps: true }
);

UserSchema.plugin(auditPlugin, { entity_type: "User", entity_no_field: "user_id" });

const UserModel = mongoose.model("User", UserSchema);

export default UserModel;
