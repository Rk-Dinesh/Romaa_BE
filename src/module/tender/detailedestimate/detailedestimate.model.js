import mongoose from "mongoose";

// Work Phase Breakdown Schema
const WorkPhaseBreakdownSchema = new mongoose.Schema({
    phase: { type: String, required: true },
    quantity: { type: Number, required: true },
    amount: { type: Number, required: true }
}, { _id: false });

// Abstract Schema (with abstract_id)
const AbstractSchema = new mongoose.Schema({
    abstract_id: { type: String, required: true }, // Added for custom headings
    description: { type: String, required: true },
    unit: { type: String, default: "" },
    quantity: { type: Number, default: 0 },
    rate: { type: Number, default: 0 },
    amount: { type: Number, default: 0 },
    balance_quantity: { type: Number, default: 0 },
    balance_amount: { type: Number, default: 0 }
}, { _id: false });

// Particulars Breakdown Schema (inside detailed arrays)
const ParticularsBreakdownSchema = new mongoose.Schema({
    particulars: { type: String, required: true },
    nos: { type: String, default: "" },
    l: { type: Number, default: 0 },
    b: { type: Number, default: 0 },
    d_h: { type: Number, default: 0 },
    content: { type: Number, default: 0 },
    balance_quantity: { type: Number, default: 0 },
    phase_breakdown: { type: [WorkPhaseBreakdownSchema], default: [] }
}, { _id: false });

// Detailed Schema (for custom headings like "road", "bridge")
const DetailedSchema = new mongoose.Schema({
    abstract_id: { type: String, required: true },
    breakdown: { type: [ParticularsBreakdownSchema], default: [] }
}, { _id: false });

// Dynamic Heading Schema (for custom heads like "road", "bridge", etc.)
const HeadingSchema = new mongoose.Schema({
    heading: { type: String, required: true },
    // Accept dynamic keys with arrays of mixed content (loosely typed)
}, { strict: false, _id: false });

// Detailed Estimate Schema
const DetailedEstimateSchema = new mongoose.Schema({
    generalabstract: { type: Array, default: [] },
      billofqty: { type: Array, default: [] },
    customheadings: { type: [HeadingSchema], default: [] } ,// any number of user-defined headings
    total_spent: { type: Object, default: {} }
}, { _id: false });

// Main Document Schema
const MainSchema = new mongoose.Schema({
    tender_id: { type: String, required: true },
    detailed_estimate: { type: [DetailedEstimateSchema], default: [] },
   
}, { timestamps: true });

const DetailedEstimateModel = mongoose.model("DetailedEstimates", MainSchema);

export default DetailedEstimateModel;
