import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock mongoose models — no real DB ────────────────────────────────────────
vi.mock("../../src/module/finance/currency/currency.model.js", () => ({
  default: { findOne: vi.fn(), findOneAndUpdate: vi.fn() },
}));
vi.mock("../../src/module/finance/currency/exchangerate.model.js", () => ({
  default: { findOne: vi.fn(), findOneAndUpdate: vi.fn() },
}));

import ExchangeRateModel from "../../src/module/finance/currency/exchangerate.model.js";
import CurrencyService from "../../src/module/finance/currency/currency.service.js";

// ── Pure formula helpers (extracted from CurrencyService) ────────────────────
const round2 = (n) => Math.round((n ?? 0) * 100) / 100;

const convertToBaseFormula = (amount, rate) => round2(Number(amount) * rate);

describe("Currency Conversion — formula logic", () => {
  // ── Inline formula tests (no DB, no service) ─────────────────────────────

  it("INR base currency: convertToBase(100, rate=1) → 100", () => {
    expect(convertToBaseFormula(100, 1)).toBe(100);
  });

  it("USD to INR: convertToBase(100, rate=83.5) → 8350", () => {
    expect(convertToBaseFormula(100, 83.5)).toBe(8350);
  });

  it("EUR to INR rounding: 33.33 × 90.12 → correctly rounded", () => {
    const expected = Math.round(33.33 * 90.12 * 100) / 100;
    expect(convertToBaseFormula(33.33, 90.12)).toBe(expected);
  });

  it("small amount with high rate rounds correctly", () => {
    // 1.001 × 83.5 = 83.5835 → rounds to 83.58
    expect(convertToBaseFormula(1.001, 83.5)).toBe(83.58);
  });

  it("zero amount → 0 regardless of rate", () => {
    expect(convertToBaseFormula(0, 83.5)).toBe(0);
  });

  it("net_amount_inr = net_amount × exchange_rate (foreign bill formula)", () => {
    const net_amount = 5000;       // USD
    const exchange_rate = 83.20;   // INR per USD
    const net_amount_inr = round2(net_amount * exchange_rate);
    expect(net_amount_inr).toBe(416000);
  });

  it("fractional rate produces correct 2-dp result", () => {
    // 10 GBP × 107.123 = 1071.23
    expect(convertToBaseFormula(10, 107.123)).toBe(1071.23);
  });
});

describe("CurrencyService.convertToBase — with mocked ExchangeRateModel", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns {base_amount: 100, exchange_rate: 1} for INR (no DB call)", async () => {
    const result = await CurrencyService.convertToBase(100, "INR", new Date());
    expect(result).toEqual({ base_amount: 100, exchange_rate: 1 });
    // ExchangeRateModel.findOne should NOT have been called
    expect(ExchangeRateModel.findOne).not.toHaveBeenCalled();
  });

  it("converts USD to INR using mocked DB rate", async () => {
    // getRateForDate calls ExchangeRateModel.findOne({ from_currency, date: { $lte } }).sort().lean()
    const chainMock = { sort: vi.fn().mockReturnThis(), lean: vi.fn().mockResolvedValue({ rate: 83.5 }) };
    ExchangeRateModel.findOne.mockReturnValue(chainMock);

    const result = await CurrencyService.convertToBase(100, "USD", new Date("2025-04-01"));
    expect(result.base_amount).toBe(8350);
    expect(result.exchange_rate).toBe(83.5);
  });

  it("throws when no exchange rate found for currency on given date", async () => {
    const chainMock = { sort: vi.fn().mockReturnThis(), lean: vi.fn().mockResolvedValue(null) };
    ExchangeRateModel.findOne.mockReturnValue(chainMock);

    await expect(CurrencyService.convertToBase(100, "JPY", new Date("2025-01-01")))
      .rejects.toThrow(/No exchange rate found for JPY/);
  });

  it("getRateForDate returns 1 immediately for INR without DB hit", async () => {
    const rate = await CurrencyService.getRateForDate("INR", new Date());
    expect(rate).toBe(1);
    expect(ExchangeRateModel.findOne).not.toHaveBeenCalled();
  });

  it("getRateForDate returns closest rate on or before date (mocked)", async () => {
    const chainMock = { sort: vi.fn().mockReturnThis(), lean: vi.fn().mockResolvedValue({ rate: 89.10 }) };
    ExchangeRateModel.findOne.mockReturnValue(chainMock);

    const rate = await CurrencyService.getRateForDate("EUR", new Date("2025-06-15"));
    expect(rate).toBe(89.10);
  });

  it("getRateForDate is case-insensitive for currency code", async () => {
    const chainMock = { sort: vi.fn().mockReturnThis(), lean: vi.fn().mockResolvedValue({ rate: 83.5 }) };
    ExchangeRateModel.findOne.mockReturnValue(chainMock);

    const rate = await CurrencyService.getRateForDate("usd", new Date());
    expect(rate).toBe(83.5);
    // Should query with uppercased code
    expect(ExchangeRateModel.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ from_currency: "USD" })
    );
  });
});
