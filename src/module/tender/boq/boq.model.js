import mongoose from "mongoose";

const boqItemSchema = new mongoose.Schema(
  {
    item_code: String,
     item_name: String,                    // Standard Work Classification Code
    description: String,                // Work description (e.g., "Earthwork Excavation")
    specification: String,              // Relevant specifications or standards
    unit: String,                       // Unit of measurement (e.g., m3, Sqm, Kg)
    quantity: Number,
    final_unit_rate: Number,                  // Estimated rate/unit
    zero_cost_unit_rate: Number,          // Rate for zero-cost items
    final_amount: Number,                     // Calculated (quantity * unit_rate)
    zero_cost_final_amount: Number,         // Amount for zero-cost items
    category: String,                   // Major, minor, sub-item, etc
    remarks: String,
    work_section: String,               // Foundation, Superstructure, etc.
  },
  { _id: false }
);

const boqSchema = new mongoose.Schema(
  {
    boq_id: { type: String, unique: true },
    tender_id: String,                 // Reference to the Project
    phase: {type:String ,default:""},                      // Phase/Stage: e.g., "Excavation", "Finishing"
    revision: Number,
    status: String,                     // Draft, Verified, Finalized
    items: [boqItemSchema],             // Array of individual BOQ items
    total_amount: Number,               // Sum of all item amounts
    prepared_by: {type:String ,default:""},
    approved_by: {type:String ,default:""},
    prepared_date: Date,
    approved_date: Date,
    attachments: [
      {
        file_name: String,
        file_url: String,
        uploaded_at: Date,
      }
    ],
    created_by_user: {type:String ,default:"ADMIN"},
  },
  { timestamps: true }
);

const BoqModel = mongoose.model("Boqs", boqSchema);

export default BoqModel;
