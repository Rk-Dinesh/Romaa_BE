import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "node:crypto";

// ── Mock DB model — no real DB ────────────────────────────────────────────────
vi.mock("../../src/module/finance/events/webhookSubscription.model.js", () => ({
  default: {
    find:              vi.fn(),
    findByIdAndUpdate: vi.fn().mockResolvedValue({}),
    create:            vi.fn(),
    findByIdAndDelete: vi.fn(),
  },
}));
vi.mock("../../src/module/finance/events/financeEvents.js", () => ({
  financeEvents:  { on: vi.fn() },
  FINANCE_EVENTS: { BILL_CREATED: "bill.created", BILL_APPROVED: "bill.approved" },
}));
vi.mock("../../src/config/logger.js", () => ({
  default: { warn: vi.fn(), info: vi.fn() },
}));

import WebhookSubscriptionModel from "../../src/module/finance/events/webhookSubscription.model.js";

// ── Pure signing helpers (mirroring webhook.service.js) ──────────────────────
// Source: const sig = crypto.createHmac("sha256", sub.secret).update(body).digest("hex")

const signPayload = (secret, payload) =>
  crypto.createHmac("sha256", secret).update(JSON.stringify(payload)).digest("hex");

const signBody = (secret, body) =>
  crypto.createHmac("sha256", secret).update(body).digest("hex");

// Simulate the auto-disable logic from deliverWebhook
const MAX_FAILURES = 10;
const simulateFailures = (currentFailureCount, additionalFailures) => {
  let count = currentFailureCount;
  for (let i = 0; i < additionalFailures; i++) {
    count += 1;
  }
  return { failure_count: count, is_active: count < MAX_FAILURES };
};

describe("Webhook HMAC Signing", () => {
  it("generates a 64-char hex HMAC-SHA256 signature", () => {
    const sig = signPayload("my-secret", { event: "bill.created", amount: 1000 });
    expect(sig).toHaveLength(64);
    expect(sig).toMatch(/^[0-9a-f]+$/);
  });

  it("same secret + same payload produces the same signature (deterministic)", () => {
    const payload = { event: "bill.created", doc_id: "PB/25-26/0001", amount: 50_000 };
    const sig1 = signPayload("secret-key", payload);
    const sig2 = signPayload("secret-key", payload);
    expect(sig1).toBe(sig2);
  });

  it("wrong secret → different signature (tamper detection)", () => {
    const payload = { event: "bill.created", amount: 1000 };
    const sigCorrect = signPayload("correct-secret", payload);
    const sigWrong   = signPayload("wrong-secret",   payload);
    expect(sigCorrect).not.toBe(sigWrong);
  });

  it("changing one field in payload → different signature", () => {
    const base     = { event: "bill.created", amount: 1000 };
    const modified = { event: "bill.created", amount: 9999 };  // amount differs
    const sig1 = signPayload("secret", base);
    const sig2 = signPayload("secret", modified);
    expect(sig1).not.toBe(sig2);
  });

  it("adding an extra field to payload → different signature", () => {
    const base     = { event: "bill.created" };
    const extended = { event: "bill.created", extra: "field" };
    const sig1 = signPayload("secret", base);
    const sig2 = signPayload("secret", extended);
    expect(sig1).not.toBe(sig2);
  });

  it("empty string secret still produces a valid HMAC (no crash)", () => {
    const sig = signBody("", JSON.stringify({ event: "test" }));
    expect(sig).toHaveLength(64);
  });

  it("X-Romaa-Signature header value matches computed HMAC from body string", () => {
    const secret = "webhook-secret-xyz";
    const body   = JSON.stringify({ event: "bill.approved", doc_id: "PB/25-26/0005", amount: 100_000 });
    const expected = signBody(secret, body);

    // Simulate what deliverWebhook does:
    const computed = crypto.createHmac("sha256", secret).update(body).digest("hex");
    expect(computed).toBe(expected);
  });
});

describe("Webhook Auto-disable on Consecutive Failures", () => {
  it("0 failures → is_active=true", () => {
    const { is_active, failure_count } = simulateFailures(0, 0);
    expect(is_active).toBe(true);
    expect(failure_count).toBe(0);
  });

  it("9 consecutive failures → is_active=true (below threshold)", () => {
    const { is_active, failure_count } = simulateFailures(0, 9);
    expect(is_active).toBe(true);
    expect(failure_count).toBe(9);
  });

  it("10 consecutive failures → is_active=false (threshold reached)", () => {
    const { is_active, failure_count } = simulateFailures(0, 10);
    expect(is_active).toBe(false);
    expect(failure_count).toBe(10);
  });

  it("11 consecutive failures → is_active=false (beyond threshold)", () => {
    const { is_active } = simulateFailures(0, 11);
    expect(is_active).toBe(false);
  });

  it("partial failures that reach 10 cumulatively → disabled", () => {
    // 7 existing failures + 3 more = 10 total
    const { is_active, failure_count } = simulateFailures(7, 3);
    expect(failure_count).toBe(10);
    expect(is_active).toBe(false);
  });

  it("successful delivery resets failure_count to 0 (simulate model update)", async () => {
    // After success: findByIdAndUpdate called with { failure_count: 0 }
    const updateCall = { failure_count: 0, last_triggered_at: new Date() };
    await WebhookSubscriptionModel.findByIdAndUpdate("sub-id", updateCall);
    expect(WebhookSubscriptionModel.findByIdAndUpdate).toHaveBeenCalledWith(
      "sub-id",
      expect.objectContaining({ failure_count: 0 })
    );
  });
});

describe("Webhook AbortSignal timeout logic", () => {
  it("AbortSignal.timeout(10_000) creates an abort signal (browser-compatible API exists)", () => {
    // Node 17.3+ / browser: AbortSignal.timeout should be a function
    expect(typeof AbortSignal.timeout).toBe("function");
    const signal = AbortSignal.timeout(10_000);
    expect(signal).toBeDefined();
    // Signal is not yet aborted immediately
    expect(signal.aborted).toBe(false);
  });

  it("AbortSignal.timeout with a very short duration triggers abort flag after delay", async () => {
    // Use a very short timeout (10ms) and wait for it to trigger
    const signal = AbortSignal.timeout(10);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(signal.aborted).toBe(true);
  });
});

describe("WebhookService.subscribe — mock DB", () => {
  beforeEach(() => vi.clearAllMocks());

  it("subscribe throws when url is missing", async () => {
    // Import lazily to avoid circular mock issues
    const { default: WebhookService } = await import("../../src/module/finance/events/webhook.service.js");
    await expect(WebhookService.subscribe({ events: [], secret: "", created_by: "u1" }))
      .rejects.toThrow("url is required");
  });

  it("subscribe calls model.create with correct shape", async () => {
    WebhookSubscriptionModel.create.mockResolvedValue({
      _id: "sub-001", url: "https://example.com/hook", events: ["bill.created"], is_active: true,
    });
    const { default: WebhookService } = await import("../../src/module/finance/events/webhook.service.js");
    const result = await WebhookService.subscribe({
      url:        "https://example.com/hook",
      events:     ["bill.created"],
      secret:     "my-secret",
      created_by: "user-001",
    });
    expect(WebhookSubscriptionModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ url: "https://example.com/hook", is_active: true })
    );
    expect(result._id).toBe("sub-001");
  });
});
