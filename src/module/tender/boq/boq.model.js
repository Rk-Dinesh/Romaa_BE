import mongoose from "mongoose";

const boqItemSchema = new mongoose.Schema(
  {
    item_id: String,
    item_name: String, // Standard Work Classification Code
    description: String, // Work description (e.g., "Earthwork Excavation")
    specifications: String, // Relevant specifications or standards
    unit: String, // Unit of measurement (e.g., m3, Sqm, Kg)
    quantity: Number,
    n_rate: Number, // Estimated rate/unit
    n_amount: Number, // Calculated (quantity * unit_rate)
    remarks: String,
    work_section: String, // Foundation, Superstructure, etc.
    consumable_material_rate: { type: Number, default: 0 },
    consumable_material_amount: { type: Number, default: 0 },
    bulk_material_rate: { type: Number, default: 0 },
    bulk_material_amount: { type: Number, default: 0 },
    machinery_rate: { type: Number, default: 0 },
    machinery_amount: { type: Number, default: 0 },
    fuel_rate: { type: Number, default: 0 },
    fuel_amount: { type: Number, default: 0 },
    contractor_rate: { type: Number, default: 0 },
    contractor_amount: { type: Number, default: 0 },
    nmr_rate: { type: Number, default: 0 },
    nmr_amount: { type: Number, default: 0 },
    final_rate: { type: Number, default: 0 },
    final_amount: { type: Number, default: 0 },
    variance_amount: { type: Number, default: 0 },
    variance_percentage: { type: Number, default: 0 },
  },
  { _id: false }
);

const boqSchema = new mongoose.Schema(
  {
    tender_id: String,
    status: String,
    items: [boqItemSchema],
    boq_total_amount: { type: Number, default: 0 },
    zero_cost_total_amount: { type: Number, default: 0 },
    variance_amount: { type: Number, default: 0 },
    variance_percentage: { type: Number, default: 0 },
    consumable_material: { type: Number, default: 0 },
    bulk_material: { type: Number, default: 0 },
    total_material_amount: { type: Number, default: 0 },
    machinery: { type: Number, default: 0 },
    fuel: { type: Number, default: 0 },
    total_machine_amount: { type: Number, default: 0 },
    contractor: { type: Number, default: 0 },
    nmr: { type: Number, default: 0 },
    total_labor_amount: { type: Number, default: 0 },
    created_by_user: { type: String, default: "ADMIN" },
  },
  { timestamps: true }
);

const BoqModel = mongoose.model("Boqs", boqSchema);

export default BoqModel;
