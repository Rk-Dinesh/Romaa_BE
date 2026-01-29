import mongoose from "mongoose";


// ---LEVEL 4: Measurement Details (The "Sub-Item") ---
const MeasurementDetailSubSchema = new mongoose.Schema(
  {
    description: { type: String, default: "" }, // Specific location e.g. "Grid 1-2"
    nos:{type:String,default:""},
    cutting_length:{type:Number,default:0},
    unit_weight:{type:Number,default:0},
    mm_8:{type:Number,default:0},
    mm_10:{type:Number,default:0},
    mm_12:{type:Number,default:0},
    mm_16:{type:Number,default:0},
    mm_20:{type:Number,default:0},
    mm_25:{type:Number,default:0},
    mm_32:{type:Number,default:0},
  },
  { _id: true } 
);

// --- LEVEL 3: Measurement Details (The "Sub-Item") ---
// This represents one row in the Measurement Book (MB).
// Example: "Long Wall", "Short Wall"
const MeasurementDetailSchema = new mongoose.Schema(
  {
    description: { type: String, default: "" }, // Specific location e.g. "Grid A-B"
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
    item_name: { type: String, required: true },
    mm_8:{type:Number,default:0},
    mm_10:{type:Number,default:0},
    mm_12:{type:Number,default:0},
    mm_16:{type:Number,default:0},
    mm_20:{type:Number,default:0},
    mm_25:{type:Number,default:0},
    mm_32:{type:Number,default:0},
    total_weight:{type:Number,default:0},
    qtl:{type:Number,default:0},
    
    
    // The "Details" Array (Level 3)
    details: [MeasurementDetailSchema], 
  },
  { _id: true }
);

// --- LEVEL 1: The Billing Document (The "Root") ---
const SteelEstimateSchema = new mongoose.Schema(
  {
    tender_id: { 
      type: String, 
      required: true, 
      index: true 
    },
    bill_id: { 
      type: String, 
      required: true, 
    },
    bill_sequence: { type: Number, default: 0 },
    abstract_name: { 
      type: String, 
      default: "Abstract Estimate" 
    },
    items: [WorkItemSchema], 
    created_by_user: { type: String, default: "ADMIN" },
  },
  { timestamps: true }
);



const SteelEstimateModel = mongoose.model("steelestimate", SteelEstimateSchema);
export default SteelEstimateModel;


