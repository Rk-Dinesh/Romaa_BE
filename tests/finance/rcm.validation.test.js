import { describe, it, expect } from "vitest";

// ── Pure helpers mirroring the RCM validation logic in purchasebill.service.js ──
// rcm_applicable=true means the recipient pays GST directly to the government.
// Therefore, the bill itself must carry ZERO GST (vendor charges nothing extra).
// rcm_amount is the self-assessed liability: taxable_value × rcm_rate / 100.

const round2 = (n) => Math.round((n ?? 0) * 100) / 100;

function validateRCM(bill) {
  const { rcm_applicable, cgst_amount = 0, sgst_amount = 0, igst_amount = 0 } = bill;
  const totalGST = (cgst_amount || 0) + (sgst_amount || 0) + (igst_amount || 0);

  if (rcm_applicable && totalGST > 0) {
    throw new Error("RCM bills must have zero GST");
  }
  return true;
}

function computeRCMAmount(taxable_value, rcm_rate) {
  if (!taxable_value || taxable_value <= 0) return 0;
  if (!rcm_rate || rcm_rate <= 0) return 0;
  return round2(taxable_value * rcm_rate / 100);
}

describe("RCM Validation", () => {
  // ── validateRCM: should throw when rcm_applicable=true and GST > 0 ──────────

  it("rcm_applicable=true + cgst_amount>0 → throws 'RCM bills must have zero GST'", () => {
    const bill = { rcm_applicable: true, cgst_amount: 900, sgst_amount: 0, igst_amount: 0 };
    expect(() => validateRCM(bill)).toThrow("RCM bills must have zero GST");
  });

  it("rcm_applicable=true + sgst_amount>0 → throws", () => {
    const bill = { rcm_applicable: true, cgst_amount: 0, sgst_amount: 900, igst_amount: 0 };
    expect(() => validateRCM(bill)).toThrow("RCM bills must have zero GST");
  });

  it("rcm_applicable=true + igst_amount>0 → throws", () => {
    const bill = { rcm_applicable: true, cgst_amount: 0, sgst_amount: 0, igst_amount: 1800 };
    expect(() => validateRCM(bill)).toThrow("RCM bills must have zero GST");
  });

  it("rcm_applicable=true + all GST fields > 0 → throws", () => {
    const bill = { rcm_applicable: true, cgst_amount: 900, sgst_amount: 900, igst_amount: 1800 };
    expect(() => validateRCM(bill)).toThrow("RCM bills must have zero GST");
  });

  // ── validateRCM: valid scenarios ─────────────────────────────────────────────

  it("rcm_applicable=true + all GST = 0 → valid (passes)", () => {
    const bill = { rcm_applicable: true, cgst_amount: 0, sgst_amount: 0, igst_amount: 0 };
    expect(() => validateRCM(bill)).not.toThrow();
    expect(validateRCM(bill)).toBe(true);
  });

  it("rcm_applicable=false + cgst > 0 → valid (normal bill)", () => {
    const bill = { rcm_applicable: false, cgst_amount: 900, sgst_amount: 900, igst_amount: 0 };
    expect(() => validateRCM(bill)).not.toThrow();
  });

  it("rcm_applicable=false + igst > 0 → valid (interstate normal bill)", () => {
    const bill = { rcm_applicable: false, cgst_amount: 0, sgst_amount: 0, igst_amount: 1800 };
    expect(() => validateRCM(bill)).not.toThrow();
  });

  it("rcm_applicable=false + all GST = 0 → valid (zero-rated or exempt)", () => {
    const bill = { rcm_applicable: false, cgst_amount: 0, sgst_amount: 0, igst_amount: 0 };
    expect(() => validateRCM(bill)).not.toThrow();
  });

  // ── computeRCMAmount: formula correctness ────────────────────────────────────

  it("rcm_amount = taxable_value × rcm_rate / 100 at 18%", () => {
    // 10,000 × 18 / 100 = 1,800
    expect(computeRCMAmount(10_000, 18)).toBe(1800);
  });

  it("rcm_amount at 5% rate", () => {
    // 50,000 × 5 / 100 = 2,500
    expect(computeRCMAmount(50_000, 5)).toBe(2500);
  });

  it("rcm_amount rounds to 2 decimal places", () => {
    // 33333 × 18 / 100 = 5999.94
    expect(computeRCMAmount(33_333, 18)).toBe(5999.94);
  });

  it("rcm_amount = 0 when taxable_value is 0", () => {
    expect(computeRCMAmount(0, 18)).toBe(0);
  });

  it("rcm_amount = 0 when rcm_rate is 0", () => {
    expect(computeRCMAmount(10_000, 0)).toBe(0);
  });

  it("rcm_applicable defaults to false when field is absent → GST allowed", () => {
    // No rcm_applicable field means the caller treats it as false
    const bill = { cgst_amount: 900, sgst_amount: 900 };
    // validateRCM reads rcm_applicable as undefined → falsy → no throw
    expect(() => validateRCM(bill)).not.toThrow();
  });
});
