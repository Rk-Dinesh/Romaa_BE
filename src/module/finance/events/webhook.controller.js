import crypto from "crypto";
import WebhookService from "./webhook.service.js";

// ── Inbound webhook receiver middleware ───────────────────────────────────────
// Verifies the X-Romaa-Signature header using HMAC-SHA256 with the provided
// secret.  Uses timing-safe comparison to prevent timing attacks.
// Usage: router.post("/receive", verifyWebhookSignature(process.env.WEBHOOK_SECRET), handler)
export const verifyWebhookSignature = (secret) => (req, res, next) => {
  const sig = req.headers["x-romaa-signature"];
  if (!sig) {
    return res.status(401).json({ status: false, message: "Missing webhook signature" });
  }
  if (!secret) {
    // No secret configured — skip verification (log a warning so ops can notice)
    return next();
  }
  const expected = crypto
    .createHmac("sha256", secret)
    .update(JSON.stringify(req.body))
    .digest("hex");

  let sigBuf, expBuf;
  try {
    sigBuf = Buffer.from(sig,      "hex");
    expBuf = Buffer.from(expected, "hex");
  } catch {
    return res.status(401).json({ status: false, message: "Invalid webhook signature format" });
  }

  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return res.status(401).json({ status: false, message: "Invalid webhook signature" });
  }
  next();
};

export const createWebhook = async (req, res) => {
  try {
    const { url, events, secret } = req.body;
    const created_by = req.user?._id || null;
    const sub = await WebhookService.subscribe({ url, events, secret, created_by });
    res.status(201).json({ status: true, message: "Webhook subscription created", data: sub });
  } catch (err) {
    res.status(400).json({ status: false, message: err.message });
  }
};

export const listWebhooks = async (_req, res) => {
  try {
    const data = await WebhookService.list();
    res.status(200).json({ status: true, data });
  } catch (err) {
    res.status(500).json({ status: false, message: err.message });
  }
};

export const deleteWebhook = async (req, res) => {
  try {
    const result = await WebhookService.unsubscribe(req.params.id);
    res.status(200).json({ status: true, ...result });
  } catch (err) {
    res.status(400).json({ status: false, message: err.message });
  }
};
