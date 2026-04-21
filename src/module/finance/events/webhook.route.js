import { Router } from "express";
import { createWebhook, listWebhooks, deleteWebhook, verifyWebhookSignature } from "./webhook.controller.js";
import { verifyJWT } from "../../../common/Auth.middlware.js";

const webhookRouter = Router();

// POST /finance/webhooks — subscribe
webhookRouter.post("/", verifyJWT, createWebhook);

// GET /finance/webhooks — list subscriptions
webhookRouter.get("/", verifyJWT, listWebhooks);

// DELETE /finance/webhooks/:id — unsubscribe
webhookRouter.delete("/:id", verifyJWT, deleteWebhook);

// POST /finance/webhooks/receive — inbound webhook receiver from external systems.
// Verifies HMAC-SHA256 signature sent in X-Romaa-Signature header.
// External senders must sign the JSON body with process.env.WEBHOOK_SECRET.
webhookRouter.post(
  "/receive",
  verifyWebhookSignature(process.env.WEBHOOK_SECRET),
  (req, res) => {
    // Acknowledge receipt immediately; actual processing handled by event listeners.
    res.status(200).json({ status: true, message: "Webhook received" });
  },
);

export default webhookRouter;
