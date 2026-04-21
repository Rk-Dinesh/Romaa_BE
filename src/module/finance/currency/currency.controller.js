import CurrencyService from "./currency.service.js";
import ExchangeRateModel from "./exchangerate.model.js";

// ── GET /list — list all active currencies ────────────────────────────────────
export const getCurrencies = async (req, res) => {
  try {
    const data = await CurrencyService.getAll();
    return res.status(200).json({ status: true, data });
  } catch (error) {
    return res.status(500).json({ status: false, message: error.message });
  }
};

// ── GET /:code — get a single currency by ISO code ────────────────────────────
export const getCurrencyByCode = async (req, res) => {
  try {
    const { code } = req.params;
    const data = await CurrencyService.getByCode(code);
    if (!data) {
      return res.status(404).json({ status: false, message: `Currency not found: ${code}` });
    }
    return res.status(200).json({ status: true, data });
  } catch (error) {
    return res.status(500).json({ status: false, message: error.message });
  }
};

// ── POST /upsert — create or update a currency ───────────────────────────────
export const upsertCurrency = async (req, res) => {
  try {
    const data = await CurrencyService.upsert(req.body);
    return res.status(200).json({ status: true, message: "Currency saved", data });
  } catch (error) {
    return res.status(400).json({ status: false, message: error.message });
  }
};

// ── PATCH /:code/inactive — deactivate a currency ────────────────────────────
export const setInactive = async (req, res) => {
  try {
    const { code } = req.params;
    const data = await CurrencyService.setInactive(code);
    return res.status(200).json({ status: true, message: "Currency deactivated", data });
  } catch (error) {
    return res.status(400).json({ status: false, message: error.message });
  }
};

// ── GET /rates — list exchange rates (all or filtered by currency) ────────────
// Query params: ?currency=USD&limit=50
export const getRates = async (req, res) => {
  try {
    const { currency, limit = 50 } = req.query;

    let data;
    if (currency) {
      data = await CurrencyService.getRatesForCurrency(currency, Number(limit));
    } else {
      // Return most recent rate for each currency
      data = await ExchangeRateModel.aggregate([
        { $sort: { from_currency: 1, date: -1 } },
        {
          $group: {
            _id: "$from_currency",
            from_currency: { $first: "$from_currency" },
            to_currency:   { $first: "$to_currency" },
            rate:          { $first: "$rate" },
            date:          { $first: "$date" },
            source:        { $first: "$source" },
          },
        },
        { $sort: { from_currency: 1 } },
      ]);
    }

    return res.status(200).json({ status: true, data });
  } catch (error) {
    return res.status(500).json({ status: false, message: error.message });
  }
};

// ── POST /rates/upsert — insert or update an exchange rate ───────────────────
export const upsertRate = async (req, res) => {
  try {
    const { from_currency, date, rate, source, narration } = req.body;
    const data = await CurrencyService.upsertRate({ from_currency, date, rate, source, narration });
    return res.status(200).json({ status: true, message: "Exchange rate saved", data });
  } catch (error) {
    return res.status(400).json({ status: false, message: error.message });
  }
};
