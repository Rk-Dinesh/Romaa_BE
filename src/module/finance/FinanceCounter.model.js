import mongoose from "mongoose";

// ── Atomic per-type, per-FY sequence counter ──────────────────────────────────
//
// _id format:  "<TYPE>/<FY>"   e.g.  "PB/25-26",  "JE/25-26",  "CN/25-26"
//
// Usage (replaces the non-atomic findOne().sort({ createdAt: -1 }) pattern):
//
//   const counter = await FinanceCounterModel.findByIdAndUpdate(
//     `PB/${fy}`,
//     { $inc: { seq: 1 } },
//     { new: true, upsert: true }
//   );
//   const doc_id = `PB/${fy}/${String(counter.seq).padStart(4, "0")}`;
//
// findByIdAndUpdate with $inc + upsert is atomic — two concurrent requests can
// never receive the same sequence number.
//
// Supported type prefixes:
//   PB   — PurchaseBill
//   JE   — JournalEntry
//   CN   — CreditNote
//   DN   — DebitNote
//   PV   — PaymentVoucher
//   RV   — ReceiptVoucher
//   CCN  — ClientCreditNote
//   CB   — ClientBilling
//   BT   — BankTransfer

const FinanceCounterSchema = new mongoose.Schema(
  {
    _id: { type: String },          // "PB/25-26"
    seq: { type: Number, default: 0 },
  },
  { _id: false, timestamps: false }
);

const FinanceCounterModel = mongoose.model("FinanceCounter", FinanceCounterSchema);
export default FinanceCounterModel;
