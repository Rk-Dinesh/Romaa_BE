import mongoose from "mongoose";

const UserSchema = new mongoose.Schema(
  {
    name: { type: String },
    email: { type: String },
    mobile: { type: String },
    city: { type: String },
    country: { type: String },
    pincode: { type: String },
    state: { type: String },
    address: { type: String },
    bloodGroup: { type: String },
    password: { type: String },
    level: { type: String, required: true },
    roleId: { type: String, required: true },
    emailStatus: { type: String },
    status: { type: String },
    refreshToken: { type: String },
    lastLogin: { type: Number },
  },
  { timestamps: true }
);

const UserModel = mongoose.model("User", UserSchema);

export default UserModel;
