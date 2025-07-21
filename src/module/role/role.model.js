import mongoose from "mongoose";

const roleSchema = new mongoose.Schema(
  {
    _id: { type: String },
    roleName: { type: String, required: true },
    permissions: { type: [String] },
    description: { type: String },
    access: { type: String },
    level: { type: String },
  },
  { timestamps: true }
);

const RoleModel = mongoose.model("Roles", roleSchema);

export default RoleModel;
