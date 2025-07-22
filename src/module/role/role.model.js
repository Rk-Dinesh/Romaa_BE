import mongoose from "mongoose";

const roleSchema = new mongoose.Schema(
  {
    role_id: String,
    role_name: String,
    accessLevels: [
      {
        feature: String,
        permissions: [String],
      },
    ],
    status: String,
    created_by_user: String,
  },
  { timestamps: true }
);

const RoleModel = mongoose.model("Roles", roleSchema);

export default RoleModel;
