import mongoose from "mongoose";


// ---LEVEL 4: Measurement Details (The "Sub-Item") ---
const MeasurementDetailSubSchema = new mongoose.Schema(
  {
    description: { type: String, default: "" }, // Specific location e.g. "Grid A-B"
    // Dimensions
    nos: { type: String, default: "" },         // "String" (replacing no1Xno2)
    length: { type: Number, default: 0 },
    breadth: { type: Number, default: 0 },
    depth: { type: Number, default: 0 },        
    quantity: { type: Number, default: 0 },   
  },
  { _id: true } 
);

// --- LEVEL 3: Measurement Details (The "Sub-Item") ---
// This represents one row in the Measurement Book (MB).
// Example: "Long Wall", "Short Wall"
const MeasurementDetailSchema = new mongoose.Schema(
  {
    description: { type: String, default: "" }, // Specific location e.g. "Grid A-B"
    // Dimensions
    nos: { type: String, default: "" },         // "String" (replacing no1Xno2)
    length: { type: Number, default: 0 },
    breadth: { type: Number, default: 0 },
    depth: { type: Number, default: 0 },        
    quantity: { type: Number, default: 0 }, 
    details: [MeasurementDetailSubSchema],  
  },
  { _id: true } 
);

// --- LEVEL 2: Main Work Item (The "Item") ---
// This groups measurements under a specific scope of work.
// Example: "Earth Work Excavation"
const WorkItemSchema = new mongoose.Schema(
  {
    item_code: { type: String, default: "" },   // e.g., "ID001"
    day:{type:String,default:""},
    item_name: { type: String, required: true }, // e.g., "PCC Concrete"
    unit: { type: String, required: true },     // e.g., "Cum", "Sqm"
    quantity:{type:Number,default:0},
    mb_book_ref:{type:String,default:""},
    
    // The "Details" Array (Level 3)
    details: [MeasurementDetailSchema], 
  },
  { _id: true }
);

// --- Estimate Document — linked to an existing Client Bill via bill_id ---
const BillingSchema = new mongoose.Schema(
  {
    tender_id:    { type: String, required: true, index: true },
    bill_id:      { type: String, required: true, index: true }, // e.g. CB/25-26/0001
    bill_sequence: { type: Number, default: 1 },
    abstract_name: { type: String, default: "Abstract Estimate" },
    items:         [WorkItemSchema],
    created_by_user: { type: String, default: "" },
  },
  { timestamps: true }
);

// One estimate type per bill — same bill can have multiple abstract_names
BillingSchema.index({ tender_id: 1, bill_id: 1, abstract_name: 1 }, { unique: true });


const BillingEstimateModel = mongoose.model("billingestimate", BillingSchema);

export default BillingEstimateModel;