import mongoose from "mongoose";

// ── Currency Master ───────────────────────────────────────────────────────────
// ISO 4217 currency codes. INR is the company base currency (is_base: true).
// Exchange rates are stored in ExchangeRateModel as from_currency → INR.

const CurrencySchema = new mongoose.Schema(
  {
    code:      { type: String, required: true, unique: true, uppercase: true, trim: true }, // ISO 4217: USD, EUR, INR
    name:      { type: String, required: true },       // "Indian Rupee", "US Dollar"
    symbol:    { type: String, required: true },       // "₹", "$", "€"
    decimals:  { type: Number, default: 2 },           // decimal places (JPY=0, KWD=3)
    is_active: { type: Boolean, default: true },       // false = deactivated, hidden from dropdowns
    is_base:   { type: Boolean, default: false },      // true for INR — the company base currency
  },
  { timestamps: true }
);

CurrencySchema.index({ is_active: 1, code: 1 });
CurrencySchema.index({ is_base: 1 });

const CurrencyModel = mongoose.model("CurrencyMaster", CurrencySchema);
export default CurrencyModel;
