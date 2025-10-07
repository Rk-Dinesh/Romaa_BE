import mongoose from "mongoose";

// Abstract Schema
const AbstractSchema = new mongoose.Schema({
    description: { type: String, required: true },
    unit: { type: String, default: "" },
    quantity: { type: Number, default: '' },
    rate: { type: Number, default: "" },
    amount: { type: Number, default: "" }
}, { _id: false });

// Detailed Schema
const DetailedSchema = new mongoose.Schema({
    description: { type: String, required: true },
    number: { type: Number, default: "" },
    length: { type: Number, default: "" },
    breath: { type: Number, default: "" },
    depth: { type: Number, default: "" },
    contents: { type: Number, default: "" }
}, { _id: false });

// Dynamic Heading Schema (for custom heads like "road", "bridge", etc.)
const HeadingSchema = new mongoose.Schema({
  heading: { type: String, required: true },
  // Accept dynamic keys with arrays of mixed content (loosely typed)
}, { strict: false, _id: false });


// Detailed Estimate Schema
const DetailedEstimateSchema = new mongoose.Schema({
    generalabstract: { type: [AbstractSchema], default: [] },
    billofqty: { type: [AbstractSchema], default: [] },
    customheadings: { type: [HeadingSchema], default: [] } // any number of user-defined headings
}, { _id: false });

// Main Document Schema
const MainSchema = new mongoose.Schema({
    tender_id: { type: String, required: true },
    detailed_estimate: { type: [DetailedEstimateSchema], default: [] }
}, { timestamps: true });

const DetailedEstimateModel = mongoose.model("DetailedEstimates", MainSchema);

export default DetailedEstimateModel;
