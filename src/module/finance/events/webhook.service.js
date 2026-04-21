import crypto from "crypto";
import WebhookSubscriptionModel from "./webhookSubscription.model.js";
import { financeEvents, FINANCE_EVENTS } from "./financeEvents.js";
import logger from "../../../config/logger.js";
import { increment, METRIC_KEYS } from "../metrics/financeMetrics.js";

const MAX_FAILURES = 10;

const deliverWebhook = async (sub, eventData) => {
  const body = JSON.stringify(eventData);
  const sig = sub.secret
    ? crypto.createHmac("sha256", sub.secret).update(body).digest("hex")
    : "";

  try {
    const res = await fetch(sub.url, {
      method: "POST",
      headers: {
        "Content-Type":       "application/json",
        "X-Romaa-Event":      eventData.event,
        "X-Romaa-Signature":  sig,
        "X-Romaa-Timestamp":  eventData.timestamp,
      },
      body,
      signal: AbortSignal.timeout(10_000), // 10s timeout
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    increment(METRIC_KEYS.WEBHOOK_DELIVERED);
    await WebhookSubscriptionModel.findByIdAndUpdate(sub._id, {
      last_triggered_at: new Date(),
      failure_count: 0,
    });
  } catch (err) {
    logger.warn({ context: "webhook.deliver", url: sub.url, event: eventData.event, message: err.message });
    increment(METRIC_KEYS.WEBHOOK_FAILED);
    const newCount = (sub.failure_count || 0) + 1;
    await WebhookSubscriptionModel.findByIdAndUpdate(sub._id, {
      failure_count: newCount,
      is_active: newCount < MAX_FAILURES,
    });
  }
};

export const initWebhookListeners = () => {
  Object.values(FINANCE_EVENTS).forEach(evt => {
    financeEvents.on(evt, async (eventData) => {
      // Fetch current active subscriptions on each event (ensures correctness over cached state)
      const subs = await WebhookSubscriptionModel.find({ is_active: true }).lean();
      const matching = subs.filter(s => s.events.length === 0 || s.events.includes(evt));
      await Promise.allSettled(matching.map(sub => deliverWebhook(sub, eventData)));
    });
  });
};

class WebhookService {
  static async subscribe({ url, events = [], secret = "", created_by }) {
    if (!url) throw new Error("url is required");
    return WebhookSubscriptionModel.create({ url, events, secret, created_by, is_active: true });
  }

  static async list() {
    return WebhookSubscriptionModel.find().sort({ createdAt: -1 }).lean();
  }

  static async unsubscribe(id) {
    const sub = await WebhookSubscriptionModel.findByIdAndDelete(id);
    if (!sub) throw new Error("Webhook subscription not found");
    return { deleted: true, id };
  }
}

export default WebhookService;
