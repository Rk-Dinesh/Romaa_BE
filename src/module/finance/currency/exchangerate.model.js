import mongoose from "mongoose";

// ── Daily Exchange Rate ───────────────────────────────────────────────────────
// Stores conversion rate from any currency TO INR (company base currency).
// from_currency: "USD", to_currency: "INR", rate: 83.5
// Unique constraint: (from_currency, date) — one rate per currency per day.
// For INR→INR: rate is always 1 (no record needed; CurrencyService handles it).

const ExchangeRateSchema = new mongoose.Schema(
  {
    from_currency: { type: String, required: true, uppercase: true, trim: true }, // "USD", "EUR"
    to_currency:   { type: String, default: "INR", uppercase: true, trim: true }, // always INR for now
    rate:          { type: Number, required: true, min: 0 },  // 1 USD = 83.5 INR
    date:          { type: Date,   required: true },           // effective date (start of day)
    source:        { type: String, enum: ["manual", "api"], default: "manual" }, // how rate was set
    narration:     { type: String, default: "" },              // optional note
  },
  { timestamps: true }
);

// One rate per currency per day
ExchangeRateSchema.index({ from_currency: 1, date: -1 }, { unique: true });
// Lookup by currency + range for historical reporting
ExchangeRateSchema.index({ from_currency: 1, date: 1 });

const ExchangeRateModel = mongoose.model("ExchangeRate", ExchangeRateSchema);
export default ExchangeRateModel;
