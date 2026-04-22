import mongoose from "mongoose";
import { auditPlugin } from "../audit/auditlog.plugin.js";

// --- Recipient sub-schema for granular targeting ---
const RecipientSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "Employee" },
    readAt: { type: Date, default: null },
    deliveredAt: { type: Date, default: null },
    dismissed: { type: Boolean, default: false },
  },
  { _id: false }
);

const NotificationSchema = new mongoose.Schema(
  {
    // --- Content ---
    title: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },

    // --- Audience targeting ---
    audienceType: {
      type: String,
      enum: ["common", "role", "user", "project", "department"],
      required: true,
    },
    roles: [{ type: mongoose.Schema.Types.ObjectId, ref: "Role" }],
    users: [{ type: mongoose.Schema.Types.ObjectId, ref: "Employee" }],
    projects: [{ type: mongoose.Schema.Types.ObjectId, ref: "Tenders" }],
    departments: [{ type: String, trim: true }],

    // --- Per-user tracking ---
    recipients: [RecipientSchema],

    // --- Categorization ---
    category: {
      type: String,
      enum: [
        "announcement",
        "approval",
        "task",
        "alert",
        "reminder",
        "system",
      ],
      default: "alert",
    },
    priority: {
      type: String,
      enum: ["low", "medium", "high", "critical"],
      default: "medium",
    },
    module: {
      type: String,
      enum: [
        "dashboard",
        "tender",
        "project",
        "purchase",
        "site",
        "hr",
        "finance",
        "report",
        "settings",
        "system",
      ],
    },

    // --- Reference to source entity ---
    reference: {
      model: { type: String },
      documentId: { type: mongoose.Schema.Types.ObjectId },
    },

    // --- Delivery channels (future: push, email, SMS) ---
    channels: {
      type: [String],
      enum: ["in_app", "email", "push", "sms"],
      default: ["in_app"],
    },

    // --- Action support (clickable notifications) ---
    actionUrl: { type: String },
    actionLabel: { type: String },

    // --- Scheduling & expiry ---
    scheduledAt: { type: Date, default: null },
    expiresAt: { type: Date, default: null },

    // --- Lifecycle ---
    isActive: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "Employee" },
  },
  { timestamps: true }
);

// --- Indexes ---

// Fetch notifications for a specific user (direct target)
NotificationSchema.index({ audienceType: 1, users: 1, isActive: 1 });

// Fetch notifications for a role
NotificationSchema.index({ audienceType: 1, roles: 1, isActive: 1 });

// Fetch notifications for a project team
NotificationSchema.index({ audienceType: 1, projects: 1, isActive: 1 });

// Fetch notifications for a department
NotificationSchema.index({ audienceType: 1, departments: 1, isActive: 1 });

// Feed ordering
NotificationSchema.index({ createdAt: -1 });

// Recipient read status lookup
NotificationSchema.index({ "recipients.userId": 1, "recipients.readAt": 1 });

// Auto-delete expired notifications (TTL index)
NotificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, partialFilterExpression: { expiresAt: { $ne: null } } });

// Scheduled notifications pickup
NotificationSchema.index({ scheduledAt: 1, isActive: 1 }, { partialFilterExpression: { scheduledAt: { $ne: null } } });

NotificationSchema.plugin(auditPlugin, { entity_type: "Notification" });

const NotificationModel = mongoose.model("Notification", NotificationSchema);

export default NotificationModel;
