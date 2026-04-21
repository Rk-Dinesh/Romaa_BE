import mongoose from "mongoose";

const WebhookSubscriptionSchema = new mongoose.Schema({
  url:        { type: String, required: true },
  events:     [{ type: String }],     // list of FINANCE_EVENTS values to subscribe to; empty = all
  secret:     { type: String, default: "" }, // HMAC secret for signature header
  is_active:  { type: Boolean, default: true },
  created_by: { type: mongoose.Schema.Types.ObjectId, ref: "Employee" },
  last_triggered_at: { type: Date },
  failure_count:     { type: Number, default: 0 }, // auto-disable after 10 consecutive failures
}, { timestamps: true });

export default mongoose.model("WebhookSubscription", WebhookSubscriptionSchema);
