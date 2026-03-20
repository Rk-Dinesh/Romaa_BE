import mongoose from "mongoose";

// Atomic sequence counter for bill_no generation.
// _id is used as the key:  "WB/{tender_id}/{fin_year}"  e.g. "WB/TND-001/25-26"
// Each tender × financial-year gets its own independent sequence starting at 1.
const billCounterSchema = new mongoose.Schema({
  _id: { type: String },        // "WB/{tender_id}/{fin_year}"
  seq: { type: Number, default: 0 },
});

const BillCounterModel = mongoose.model("BillCounter", billCounterSchema);
export default BillCounterModel;
