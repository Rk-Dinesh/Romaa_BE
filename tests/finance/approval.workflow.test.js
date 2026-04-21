import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock all external dependencies — no DB, no email ─────────────────────────
vi.mock("../../src/module/finance/approval/approvalrule.model.js",    () => ({ default: { findOne: vi.fn(), create: vi.fn() } }));
vi.mock("../../src/module/finance/approval/approvalrequest.model.js", () => ({ default: { findOne: vi.fn(), create: vi.fn(), findById: vi.fn() } }));
vi.mock("../../src/module/hr/employee/employee.model.js",              () => ({ default: { findById: vi.fn(), find: vi.fn() } }));
vi.mock("../../src/module/finance/audit/auditlog.service.js",          () => ({ default: { log: vi.fn().mockResolvedValue(undefined) } }));
vi.mock("../../src/config/logger.js",                                   () => ({ default: { warn: vi.fn(), info: vi.fn() } }));
vi.mock("nodemailer", () => ({
  default: { createTransport: vi.fn(() => ({ sendMail: vi.fn().mockResolvedValue({}) })) },
}));
vi.mock("../../src/module/finance/events/financeEvents.js", () => ({
  emitFinanceEvent: vi.fn(),
  FINANCE_EVENTS: {
    APPROVAL_APPROVED: "approval.approved",
    APPROVAL_REJECTED: "approval.rejected",
  },
}));

import ApprovalRuleModel    from "../../src/module/finance/approval/approvalrule.model.js";
import ApprovalRequestModel from "../../src/module/finance/approval/approvalrequest.model.js";
import EmployeeModel        from "../../src/module/hr/employee/employee.model.js";
import ApprovalService      from "../../src/module/finance/approval/approval.service.js";
import { APPROVAL_STATUS }  from "../../src/module/finance/finance.constants.js";

// Helper: make findOne().lean() / findOne().sort().lean() chains return a value
const mockFindOneLean = (model, value) => {
  model.findOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(value), sort: vi.fn().mockReturnThis() });
};

// Helper: build a minimal ApprovalRequest-like plain object (simulates Mongoose doc)
const makeRequest = (overrides = {}) => {
  const doc = {
    _id:                "req-001",
    source_type:        "PurchaseBill",
    source_ref:         "bill-ref-001",
    source_no:          "PB/25-26/0001",
    amount:             60_000,
    status:             APPROVAL_STATUS.PENDING,
    required_approvers: ["approver-A"],
    approved_by:        [],
    approval_log:       [],
    next_approver_id:   "approver-A",
    any_of:             false,
    initiated_by:       "initiator-001",
    save:               vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  return doc;
};

describe("Approval Workflow — threshold gating", () => {
  beforeEach(() => vi.clearAllMocks());

  it("bill below threshold (40,000 < 50,000): no rule band matched → initiate returns required=false", async () => {
    // getRule returns an active rule with min_amount 50,000
    ApprovalRuleModel.findOne.mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        source_type: "PurchaseBill",
        is_active: true,
        thresholds: [{ min_amount: 50_000, max_amount: 999_999, approvers: ["approver-A"] }],
      }),
    });
    ApprovalRequestModel.findOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });  // no existing

    const result = await ApprovalService.initiate({
      source_type:  "PurchaseBill",
      source_ref:   "bill-ref-low",
      source_no:    "PB/25-26/0001",
      amount:       40_000,
      initiator_id: "user-001",
    });

    expect(result.required).toBe(false);
    expect(ApprovalRequestModel.create).not.toHaveBeenCalled();
  });

  it("bill above threshold (60,000 > 50,000): creates ApprovalRequest → required=true", async () => {
    ApprovalRuleModel.findOne.mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        source_type: "PurchaseBill",
        is_active: true,
        thresholds: [{ min_amount: 50_000, max_amount: 999_999, approvers: ["approver-A"], any_of: false }],
      }),
    });
    ApprovalRequestModel.findOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
    ApprovalRequestModel.create.mockResolvedValue(makeRequest());
    EmployeeModel.findById.mockReturnValue({ select: vi.fn().mockReturnThis(), lean: vi.fn().mockResolvedValue({ name: "Admin" }) });
    EmployeeModel.find.mockReturnValue({ select: vi.fn().mockReturnThis(), lean: vi.fn().mockResolvedValue([]) });

    const result = await ApprovalService.initiate({
      source_type:  "PurchaseBill",
      source_ref:   "bill-ref-high",
      source_no:    "PB/25-26/0002",
      amount:       60_000,
      initiator_id: "user-001",
    });

    expect(result.required).toBe(true);
    expect(ApprovalRequestModel.create).toHaveBeenCalledOnce();
  });

  it("no approval rule configured → initiate returns required=false (pass-through)", async () => {
    ApprovalRuleModel.findOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
    ApprovalRequestModel.findOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });

    const result = await ApprovalService.initiate({
      source_type:  "PurchaseBill",
      source_ref:   "bill-ref-norule",
      source_no:    "PB/25-26/0003",
      amount:       99_999,
      initiator_id: "user-001",
    });

    expect(result.required).toBe(false);
  });
});

describe("Approval Workflow — state machine transitions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("PENDING → APPROVED: valid transition", async () => {
    const req = makeRequest({ required_approvers: ["approver-A"], approved_by: [], any_of: false });
    ApprovalRequestModel.findById.mockResolvedValue(req);
    EmployeeModel.findById.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue({ name: "Alice", email: null }),
    });
    EmployeeModel.findById.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue({ name: "Alice", email: null }),
    });

    const result = await ApprovalService.approve({ request_id: "req-001", actor_id: "approver-A", comment: "" });
    expect(result.status).toBe(APPROVAL_STATUS.APPROVED);
  });

  it("PENDING → REJECTED: valid transition", async () => {
    const req = makeRequest({ required_approvers: ["approver-A"] });
    ApprovalRequestModel.findById.mockResolvedValue(req);
    EmployeeModel.findById.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue({ name: "Alice", email: null }),
    });
    // initiator lookup for rejection email
    EmployeeModel.findById.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue({ name: "Alice", email: null }),
    });

    const result = await ApprovalService.reject({ request_id: "req-001", actor_id: "approver-A", comment: "Wrong amount" });
    expect(result.status).toBe(APPROVAL_STATUS.REJECTED);
    expect(result.approval_log[0].comment).toBe("Wrong amount");
  });

  it("APPROVED → REJECTED: throws (already approved)", async () => {
    // Simulates calling _applyAction on an already-approved request
    const req = makeRequest({ status: APPROVAL_STATUS.APPROVED });
    ApprovalRequestModel.findById.mockResolvedValue(req);

    await expect(
      ApprovalService.reject({ request_id: "req-001", actor_id: "approver-A", comment: "" })
    ).rejects.toThrow(`Request already ${APPROVAL_STATUS.APPROVED}`);
  });

  it("REJECTED → APPROVED: throws (already rejected)", async () => {
    const req = makeRequest({ status: APPROVAL_STATUS.REJECTED });
    ApprovalRequestModel.findById.mockResolvedValue(req);

    await expect(
      ApprovalService.approve({ request_id: "req-001", actor_id: "approver-A", comment: "" })
    ).rejects.toThrow(`Request already ${APPROVAL_STATUS.REJECTED}`);
  });

  it("non-authorised actor cannot approve", async () => {
    const req = makeRequest({ required_approvers: ["approver-A"] });
    ApprovalRequestModel.findById.mockResolvedValue(req);

    await expect(
      ApprovalService.approve({ request_id: "req-001", actor_id: "outsider-XYZ", comment: "" })
    ).rejects.toThrow("You are not authorized to act on this request");
  });

  it("rejection stores comment in approval_log", async () => {
    const req = makeRequest({ required_approvers: ["approver-A"] });
    ApprovalRequestModel.findById.mockResolvedValue(req);
    EmployeeModel.findById.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue({ name: "Alice", email: null }),
    });

    const result = await ApprovalService.reject({ request_id: "req-001", actor_id: "approver-A", comment: "Amount mismatch" });
    const lastLog = result.approval_log[result.approval_log.length - 1];
    expect(lastLog.comment).toBe("Amount mismatch");
    expect(lastLog.action).toBe(APPROVAL_STATUS.REJECTED);
  });
});

describe("Approval Workflow — email notifications", () => {
  beforeEach(() => vi.clearAllMocks());

  it("initiate sends email to each approver that has an email address", async () => {
    ApprovalRuleModel.findOne.mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        source_type: "PurchaseBill",
        is_active: true,
        thresholds: [{ min_amount: 0, max_amount: 999_999, approvers: ["approver-A", "approver-B"], any_of: false }],
      }),
    });
    ApprovalRequestModel.findOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
    ApprovalRequestModel.create.mockResolvedValue(makeRequest({ required_approvers: ["approver-A", "approver-B"] }));

    // initiator lookup
    EmployeeModel.findById.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue({ name: "Initiator" }),
    });
    // approvers list
    EmployeeModel.find.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([
        { _id: "approver-A", name: "Alice", email: "alice@example.com" },
        { _id: "approver-B", name: "Bob",   email: null },  // no email
      ]),
    });

    // Just confirm initiate resolves — email errors are swallowed
    const result = await ApprovalService.initiate({
      source_type:  "PurchaseBill",
      source_ref:   "bill-email-test",
      source_no:    "PB/25-26/0010",
      amount:       75_000,
      initiator_id: "user-001",
    });
    expect(result.required).toBe(true);
  });

  it("initiate throws if initiator_id is missing", async () => {
    await expect(
      ApprovalService.initiate({ source_type: "PurchaseBill", source_ref: "bill-x", amount: 1000 })
    ).rejects.toThrow("initiator_id is required");
  });

  it("initiate throws if amount is not numeric", async () => {
    await expect(
      ApprovalService.initiate({ source_type: "PurchaseBill", source_ref: "bill-x", amount: "abc", initiator_id: "u1" })
    ).rejects.toThrow("amount must be numeric");
  });
});
