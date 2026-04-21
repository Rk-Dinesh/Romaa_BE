import CurrencyModel from "./currency.model.js";
import ExchangeRateModel from "./exchangerate.model.js";

const round2 = (n) => Math.round((n ?? 0) * 100) / 100;

class CurrencyService {
  // ── Currency master ───────────────────────────────────────────────────────

  /**
   * List all active currencies.
   */
  static async getAll() {
    return CurrencyModel.find({ is_active: true }).sort({ is_base: -1, code: 1 }).lean();
  }

  /**
   * Find a currency by its ISO code (case-insensitive).
   */
  static async getByCode(code) {
    return CurrencyModel.findOne({ code: code.toUpperCase() }).lean();
  }

  /**
   * Create or update a currency record.
   * Uses code as the unique key.
   */
  static async upsert(data) {
    const code = (data.code || "").toUpperCase().trim();
    if (!code) throw new Error("Currency code is required");

    const update = {
      name:      data.name,
      symbol:    data.symbol,
      decimals:  data.decimals ?? 2,
      is_active: data.is_active !== undefined ? data.is_active : true,
      is_base:   data.is_base  !== undefined ? data.is_base  : false,
    };

    // Strip undefined values so we don't overwrite existing fields with undefined
    Object.keys(update).forEach((k) => update[k] === undefined && delete update[k]);

    return CurrencyModel.findOneAndUpdate(
      { code },
      { $set: { ...update, code } },
      { upsert: true, new: true, runValidators: true }
    ).lean();
  }

  /**
   * Deactivate a currency (soft-disable — hides from dropdowns).
   * Base currency (INR) cannot be deactivated.
   */
  static async setInactive(code) {
    const currency = await CurrencyModel.findOne({ code: code.toUpperCase() });
    if (!currency) throw new Error(`Currency not found: ${code}`);
    if (currency.is_base) throw new Error("Cannot deactivate the base currency");
    currency.is_active = false;
    await currency.save();
    return currency.toObject();
  }

  // ── Exchange rates ────────────────────────────────────────────────────────

  /**
   * Get exchange rate for a currency on a specific date.
   * Returns the most recent rate on or before the given date.
   * Returns 1 if fromCurrency === "INR" (base currency).
   */
  static async getRateForDate(fromCurrency, date) {
    const code = (fromCurrency || "").toUpperCase().trim();
    if (code === "INR") return 1;

    const targetDate = date ? new Date(date) : new Date();
    // Set to end of day so a rate set on the same day as the transaction is found
    targetDate.setHours(23, 59, 59, 999);

    const rateDoc = await ExchangeRateModel.findOne({
      from_currency: code,
      date: { $lte: targetDate },
    })
      .sort({ date: -1 })
      .lean();

    if (!rateDoc) {
      throw new Error(`No exchange rate found for ${code} on or before ${targetDate.toISOString().split("T")[0]}`);
    }

    return rateDoc.rate;
  }

  /**
   * Insert or update an exchange rate.
   * Unique key: (from_currency, date — normalised to start of day).
   */
  static async upsertRate({ from_currency, date, rate, source = "manual", narration = "" }) {
    const code = (from_currency || "").toUpperCase().trim();
    if (!code) throw new Error("from_currency is required");
    if (!date)  throw new Error("date is required");
    if (!rate || rate <= 0) throw new Error("rate must be a positive number");

    // Normalise date to start of day (UTC midnight)
    const d = new Date(date);
    d.setUTCHours(0, 0, 0, 0);

    return ExchangeRateModel.findOneAndUpdate(
      { from_currency: code, date: d },
      { $set: { from_currency: code, to_currency: "INR", date: d, rate, source, narration } },
      { upsert: true, new: true, runValidators: true }
    ).lean();
  }

  /**
   * Get the most recent exchange rate for a currency (latest date available).
   */
  static async getLatestRate(fromCurrency) {
    const code = (fromCurrency || "").toUpperCase().trim();
    if (code === "INR") return { from_currency: "INR", to_currency: "INR", rate: 1 };

    const rateDoc = await ExchangeRateModel.findOne({ from_currency: code })
      .sort({ date: -1 })
      .lean();

    if (!rateDoc) throw new Error(`No exchange rate found for ${code}`);
    return rateDoc;
  }

  /**
   * Fetch all rates for a currency (most recent first).
   * Returns paginated list; default 50 records.
   */
  static async getRatesForCurrency(fromCurrency, limit = 50) {
    const code = (fromCurrency || "").toUpperCase().trim();
    return ExchangeRateModel.find({ from_currency: code })
      .sort({ date: -1 })
      .limit(limit)
      .lean();
  }

  /**
   * Convert an amount in a foreign currency to INR.
   * Looks up the closest exchange rate on or before `date`.
   * @returns {{ base_amount: number, exchange_rate: number }}
   */
  static async convertToBase(amount, currency, date) {
    const code = (currency || "").toUpperCase().trim();
    if (code === "INR") {
      return { base_amount: round2(amount), exchange_rate: 1 };
    }

    const exchange_rate = await CurrencyService.getRateForDate(code, date);
    const base_amount   = round2(Number(amount) * exchange_rate);

    return { base_amount, exchange_rate };
  }
}

export default CurrencyService;
