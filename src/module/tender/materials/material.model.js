import mongoose from "mongoose";

const MaterialItemSchema = new mongoose.Schema(
  {
    item_description: String,
    unit: String,
    quantity: Number,
    unit_rate: Number,
    rate_tax: Number,
    total_amount: Number,
    total_material: Number,
  },
  { _id: false }
);

const materialSchema = new mongoose.Schema(
  {
    tender_id: String,
    items: [MaterialItemSchema],
    created_by_user: { type: String, default: "ADMIN" },
  },
  { timestamps: true }
);

const MaterialModel = mongoose.model("Materials", materialSchema);

export default MaterialModel;
