import { describe, it, expect } from "vitest";

const VALID_TRANSITIONS = {
  draft:     ["pending", "cancelled"],
  pending:   ["approved", "cancelled"],
  approved:  ["cancelled"],
  cancelled: [],
};

const assertTransition = (current, next) => {
  const allowed = VALID_TRANSITIONS[current] || [];
  if (!allowed.includes(next)) {
    throw new Error(`Invalid transition: ${current} → ${next}`);
  }
};

describe("Status Machine - PurchaseBill", () => {
  it("allows draft → pending", () => expect(() => assertTransition("draft", "pending")).not.toThrow());
  it("allows draft → cancelled", () => expect(() => assertTransition("draft", "cancelled")).not.toThrow());
  it("allows pending → approved", () => expect(() => assertTransition("pending", "approved")).not.toThrow());
  it("allows pending → cancelled", () => expect(() => assertTransition("pending", "cancelled")).not.toThrow());
  it("allows approved → cancelled", () => expect(() => assertTransition("approved", "cancelled")).not.toThrow());
  it("blocks draft → approved (skipping pending)", () => expect(() => assertTransition("draft", "approved")).toThrow());
  it("blocks approved → draft (regression)", () => expect(() => assertTransition("approved", "draft")).toThrow());
  it("blocks approved → pending (regression)", () => expect(() => assertTransition("approved", "pending")).toThrow());
  it("blocks any transition from cancelled (terminal)", () => expect(() => assertTransition("cancelled", "draft")).toThrow());
  it("blocks cancelled → pending (terminal state)", () => expect(() => assertTransition("cancelled", "pending")).toThrow());
  it("blocks cancelled → approved (terminal state)", () => expect(() => assertTransition("cancelled", "approved")).toThrow());
});
