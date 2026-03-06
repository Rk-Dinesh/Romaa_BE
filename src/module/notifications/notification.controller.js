import NotificationService from "./notification.service.js";

// --- 1. Create Notification (Admin) ---
export const createNotification = async (req, res) => {
  try {
    const data = { ...req.body, createdBy: req.user._id };
    const notification = await NotificationService.create(data);
    return res.status(201).json({
      status: true,
      message: "Notification created successfully",
      data: notification,
    });
  } catch (error) {
    return res.status(400).json({ status: false, message: error.message });
  }
};

// --- 2. Get My Notifications ---
export const getMyNotifications = async (req, res) => {
  try {
    const result = await NotificationService.getMyNotifications(
      req.user,
      req.query
    );
    return res.status(200).json({ status: true, data: result });
  } catch (error) {
    return res.status(500).json({ status: false, message: error.message });
  }
};

// --- 3. Get Unread Count ---
export const getUnreadCount = async (req, res) => {
  try {
    const counts = await NotificationService.getUnreadCount(req.user);
    return res.status(200).json({ status: true, data: counts });
  } catch (error) {
    return res.status(500).json({ status: false, message: error.message });
  }
};

// --- 4. Mark as Read ---
export const markAsRead = async (req, res) => {
  try {
    await NotificationService.markAsRead(req.params.id, req.user._id);
    return res
      .status(200)
      .json({ status: true, message: "Notification marked as read" });
  } catch (error) {
    return res.status(400).json({ status: false, message: error.message });
  }
};

// --- 5. Mark All as Read ---
export const markAllAsRead = async (req, res) => {
  try {
    const result = await NotificationService.markAllAsRead(req.user);
    return res.status(200).json({
      status: true,
      message: "All notifications marked as read",
      data: result,
    });
  } catch (error) {
    return res.status(500).json({ status: false, message: error.message });
  }
};

// --- 6. Dismiss Notification ---
export const dismissNotification = async (req, res) => {
  try {
    await NotificationService.dismiss(req.params.id, req.user._id);
    return res
      .status(200)
      .json({ status: true, message: "Notification dismissed" });
  } catch (error) {
    return res.status(400).json({ status: false, message: error.message });
  }
};

// --- 7. Get Notification by ID ---
export const getNotificationById = async (req, res) => {
  try {
    const notification = await NotificationService.getById(req.params.id);
    return res.status(200).json({ status: true, data: notification });
  } catch (error) {
    return res.status(404).json({ status: false, message: error.message });
  }
};

// --- 8. Update Notification (Admin) ---
export const updateNotification = async (req, res) => {
  try {
    const notification = await NotificationService.update(
      req.params.id,
      req.body
    );
    return res.status(200).json({
      status: true,
      message: "Notification updated successfully",
      data: notification,
    });
  } catch (error) {
    return res.status(400).json({ status: false, message: error.message });
  }
};

// --- 9. Delete Notification (Admin — soft delete) ---
export const deleteNotification = async (req, res) => {
  try {
    await NotificationService.delete(req.params.id);
    return res
      .status(200)
      .json({ status: true, message: "Notification deleted successfully" });
  } catch (error) {
    return res.status(400).json({ status: false, message: error.message });
  }
};

// --- 10. Get All Notifications (Admin — manage all) ---
export const getAllNotifications = async (req, res) => {
  try {
    const result = await NotificationService.getAll(req.query);
    return res.status(200).json({ status: true, data: result });
  } catch (error) {
    return res.status(500).json({ status: false, message: error.message });
  }
};
