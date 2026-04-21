import { describe, it, expect } from "vitest";

const validateGST = (line, tax_mode) => {
  const hasCGSTSGST = line.cgst_pct > 0 || line.sgst_pct > 0;
  const hasIGST = line.igst_pct > 0;
  if (hasCGSTSGST && hasIGST) throw new Error("Cannot have both CGST/SGST and IGST");
  if (tax_mode === "instate" && hasIGST) throw new Error("IGST must be 0 for intrastate");
  if (tax_mode === "otherstate" && hasCGSTSGST) throw new Error("CGST/SGST must be 0 for interstate");
};

describe("GST Cross-field Validation", () => {
  it("allows CGST+SGST for intrastate", () => {
    expect(() => validateGST({ cgst_pct: 9, sgst_pct: 9, igst_pct: 0 }, "instate")).not.toThrow();
  });
  it("allows IGST for interstate", () => {
    expect(() => validateGST({ cgst_pct: 0, sgst_pct: 0, igst_pct: 18 }, "otherstate")).not.toThrow();
  });
  it("blocks both CGST/SGST and IGST", () => {
    expect(() => validateGST({ cgst_pct: 9, sgst_pct: 9, igst_pct: 18 }, "instate")).toThrow("Cannot have both CGST/SGST and IGST");
  });
  it("blocks IGST on intrastate bill", () => {
    expect(() => validateGST({ cgst_pct: 0, sgst_pct: 0, igst_pct: 18 }, "instate")).toThrow("IGST must be 0 for intrastate");
  });
  it("blocks CGST on interstate bill", () => {
    expect(() => validateGST({ cgst_pct: 9, sgst_pct: 9, igst_pct: 0 }, "otherstate")).toThrow("CGST/SGST must be 0 for interstate");
  });
  it("allows zero-tax intrastate line (exempt goods)", () => {
    expect(() => validateGST({ cgst_pct: 0, sgst_pct: 0, igst_pct: 0 }, "instate")).not.toThrow();
  });
  it("allows zero-tax interstate line (exempt goods)", () => {
    expect(() => validateGST({ cgst_pct: 0, sgst_pct: 0, igst_pct: 0 }, "otherstate")).not.toThrow();
  });
});
