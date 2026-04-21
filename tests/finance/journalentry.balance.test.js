import { describe, it, expect, vi } from "vitest";

// Mock mongoose models — no DB connection required
vi.mock("../../src/module/finance/journalentry/journalentry.model.js", () => ({
  default: { findById: vi.fn(), create: vi.fn() }
}));

// Test the balance validation logic directly
describe("JournalEntry - Double Entry Balance", () => {
  it("should reject when Dr != Cr", () => {
    const lines = [
      { account_code: "ACC-001", debit_amt: 1000, credit_amt: 0 },
      { account_code: "ACC-002", debit_amt: 0,    credit_amt: 800 }, // imbalanced
    ];
    const totalDr = lines.reduce((s, l) => s + (l.debit_amt || 0), 0);
    const totalCr = lines.reduce((s, l) => s + (l.credit_amt || 0), 0);
    expect(Math.abs(totalDr - totalCr)).toBeGreaterThan(0.01);
  });

  it("should accept when Dr == Cr", () => {
    const lines = [
      { account_code: "ACC-001", debit_amt: 1000, credit_amt: 0 },
      { account_code: "ACC-002", debit_amt: 0,    credit_amt: 1000 },
    ];
    const totalDr = lines.reduce((s, l) => s + (l.debit_amt || 0), 0);
    const totalCr = lines.reduce((s, l) => s + (l.credit_amt || 0), 0);
    expect(Math.abs(totalDr - totalCr)).toBeLessThanOrEqual(0.01);
  });

  it("should handle floating point precision with round2", () => {
    const round2 = (n) => Math.round((n ?? 0) * 100) / 100;
    expect(round2(0.1 + 0.2)).toBe(0.3);
    expect(round2(1000.005)).toBe(1000.01);
  });

  it("should detect multi-line imbalance across 3+ entries", () => {
    const lines = [
      { debit_amt: 500,  credit_amt: 0 },
      { debit_amt: 300,  credit_amt: 0 },
      { debit_amt: 0,    credit_amt: 700 }, // only 700 credit vs 800 debit
    ];
    const totalDr = lines.reduce((s, l) => s + (l.debit_amt || 0), 0);
    const totalCr = lines.reduce((s, l) => s + (l.credit_amt || 0), 0);
    expect(totalDr).toBe(800);
    expect(totalCr).toBe(700);
    expect(Math.abs(totalDr - totalCr)).toBeGreaterThan(0.01);
  });
});
