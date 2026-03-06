import { Router } from "express";
import {
  createNotification,
  getMyNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  dismissNotification,
  getNotificationById,
  updateNotification,
  deleteNotification,
  getAllNotifications,
} from "./notification.controller.js";
import { verifyJWT } from "../../common/Auth.middlware.js";

const notificationRoute = Router();

// All routes require authentication
notificationRoute.use(verifyJWT);

// --- User Routes (any logged-in user) ---
notificationRoute.get("/my", getMyNotifications);
notificationRoute.get("/unread-count", getUnreadCount);
notificationRoute.patch("/:id/read", markAsRead);
notificationRoute.patch("/read-all", markAllAsRead);
notificationRoute.patch("/:id/dismiss", dismissNotification);

// --- Admin Routes ---
notificationRoute.get("/all", getAllNotifications);
notificationRoute.get("/:id", getNotificationById);
notificationRoute.post("/", createNotification);
notificationRoute.put("/:id", updateNotification);
notificationRoute.delete("/:id", deleteNotification);

export default notificationRoute;
