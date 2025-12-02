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
    issued: [
      {
        site_name: { type: String, default: "" },
        issued_quantity: { type: Number, default: 0 },
        work_location: { type: String, default: "" },
        priority_level: { type: String, default: "" },
        issued_by: { type: String, default: "" },
      },
    ],
    received: [
      {
        requestId: { type: String, default: "" },
        site_name: { type: String, default: "" },
        received_quantity: { type: Number, default: 0 },
        received_date: { type: Date, default: Date.now },
        received_by: { type: String, default: "" },
      }
    ],

    received_quantity: { type: Number, default: 0 },
    pending_quantity: { type: Number, default: 0 },
    request_quantity: { type: Number, default: 0 },
    issued_quantity: { type: Number, default: 0 },
    ordered_date: Date,
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