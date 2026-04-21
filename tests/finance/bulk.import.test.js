import { describe, it, expect, vi } from "vitest";
import { processBatch, toNum, toDate, toBool, groupRowsBy } from "../../src/module/finance/bulk/bulk.utils.js";

describe("bulk.utils", () => {
  describe("toNum", () => {
    it("converts string numbers", () => expect(toNum("123.45")).toBe(123.45));
    it("returns fallback for NaN", () => expect(toNum("abc", 0)).toBe(0));
    it("handles empty string", () => expect(toNum("", 0)).toBe(0));
    it("converts integer strings", () => expect(toNum("42")).toBe(42));
    it("returns default fallback (0) when not provided", () => expect(toNum("xyz")).toBe(0));
  });

  describe("toDate", () => {
    it("converts valid ISO date", () => expect(toDate("2025-04-01")).not.toBeNull());
    it("returns null for invalid", () => expect(toDate("not-a-date")).toBeNull());
    it("returns null for empty", () => expect(toDate("")).toBeNull());
    it("converts valid datetime", () => expect(toDate("2025-04-01T10:00:00Z")).not.toBeNull());
  });

  describe("toBool", () => {
    it("converts 'yes' to true", () => expect(toBool("yes")).toBe(true));
    it("converts 'true' to true", () => expect(toBool("true")).toBe(true));
    it("converts 'no' to false", () => expect(toBool("no")).toBe(false));
    it("converts '1' to true", () => expect(toBool("1")).toBe(true));
    it("converts 'false' to false", () => expect(toBool("false")).toBe(false));
    it("is case-insensitive for YES", () => expect(toBool("YES")).toBe(true));
    it("is case-insensitive for TRUE", () => expect(toBool("TRUE")).toBe(true));
  });

  describe("groupRowsBy", () => {
    it("groups rows by key", () => {
      const rows = [
        { invoice_no: "INV-001", item: "A" },
        { invoice_no: "INV-001", item: "B" },
        { invoice_no: "INV-002", item: "C" },
      ];
      const grouped = groupRowsBy(rows, "invoice_no");
      expect(grouped.size).toBe(2);
      expect(grouped.get("INV-001").length).toBe(2);
    });

    it("handles single-group correctly", () => {
      const rows = [{ k: "X", v: 1 }, { k: "X", v: 2 }];
      const grouped = groupRowsBy(rows, "k");
      expect(grouped.size).toBe(1);
      expect(grouped.get("X").length).toBe(2);
    });

    it("handles empty array", () => {
      const grouped = groupRowsBy([], "key");
      expect(grouped.size).toBe(0);
    });
  });

  describe("processBatch", () => {
    it("counts success and failures correctly", async () => {
      const rows = [1, 2, 3, 4, 5];
      const handler = async (n) => { if (n % 2 === 0) throw new Error("even"); };
      const result = await processBatch(rows, handler, 10);
      expect(result.success).toBe(3); // 1, 3, 5
      expect(result.failed).toBe(2);  // 2, 4
      expect(result.errors.length).toBe(2);
    });

    it("returns total = success + failed", async () => {
      const rows = [1, 2, 3];
      const handler = async (n) => { if (n === 2) throw new Error("fail"); };
      const result = await processBatch(rows, handler, 10);
      expect(result.total).toBe(result.success + result.failed);
    });

    it("reports error messages", async () => {
      const rows = ["bad"];
      const handler = async () => { throw new Error("custom error message"); };
      const result = await processBatch(rows, handler, 10);
      expect(result.errors[0].message).toBe("custom error message");
    });

    it("succeeds with all valid rows", async () => {
      const rows = [1, 2, 3];
      const handler = vi.fn().mockResolvedValue(undefined);
      const result = await processBatch(rows, handler, 10);
      expect(result.success).toBe(3);
      expect(result.failed).toBe(0);
    });
  });
});
