import FinanceSettingsModel from "./financesettings.model.js";

// In-memory cache with 5-min TTL to avoid DB hit on every request
const _cache = new Map();
const TTL = 5 * 60 * 1000;

export default class FinanceSettingsService {
  static async get(key, defaultValue = null) {
    const cached = _cache.get(key);
    if (cached && Date.now() - cached.ts < TTL) return cached.value;

    const doc = await FinanceSettingsModel.findOne({ key }).lean();
    const value = doc ? doc.value : defaultValue;
    _cache.set(key, { value, ts: Date.now() });
    return value;
  }

  static async set(key, value, updatedBy, description = "") {
    _cache.delete(key); // invalidate cache
    return FinanceSettingsModel.findOneAndUpdate(
      { key },
      { value, updated_by: updatedBy, description },
      { upsert: true, new: true }
    );
  }

  static async getAll() {
    return FinanceSettingsModel.find().sort({ key: 1 }).lean();
  }
}
