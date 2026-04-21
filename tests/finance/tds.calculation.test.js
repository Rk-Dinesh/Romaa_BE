import { describe, it, expect } from "vitest";

const round2 = (n) => Math.round((n ?? 0) * 100) / 100;

describe("TDS Calculation", () => {
  it("194C: 1% on taxable value for individuals", () => {
    const taxable = 100000;
    const rate = 1;
    expect(round2(taxable * rate / 100)).toBe(1000);
  });

  it("194J: 10% on professional fees", () => {
    expect(round2(50000 * 10 / 100)).toBe(5000);
  });

  it("should be 0 when tds_applicable is false", () => {
    const bill = { tds_applicable: false, tds_rate: 2, taxable_value: 100000 };
    const tds = bill.tds_applicable ? round2(bill.taxable_value * bill.tds_rate / 100) : 0;
    expect(tds).toBe(0);
  });

  it("net payable = net_amount - tds_amount", () => {
    const net_amount = 118000; // 100K + 18% GST
    const tds_amount = 1000;
    const net_payable = round2(net_amount - tds_amount);
    expect(net_payable).toBe(117000);
  });

  it("194I: 10% on rent above threshold", () => {
    const rent = 250000;
    const rate = 10;
    expect(round2(rent * rate / 100)).toBe(25000);
  });

  it("round2 handles very small floating point errors", () => {
    // 194C on 100000.999 at 1%
    expect(round2(100000.999 * 1 / 100)).toBe(1000.01);
  });
});
