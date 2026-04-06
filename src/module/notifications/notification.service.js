import NotificationModel from "./notification.model.js";
import RoleModel from "../role/role.model.js";

class NotificationService {
  // --- 1. Create Notification (used by other modules internally + admin API) ---
  static async create(data) {
    if (!data || !data.title || !data.message) {
      throw new Error(
        "Notification title and message are required. Please provide the necessary details and try again."
      );
    }
    const notification = new NotificationModel(data);
    return await notification.save();
  }

  // --- Safe create: never throws, logs error instead ---
  // Use this from other modules so notification failures don't break business logic
  static async notify(data) {
    try {
      return await this.create(data);
    } catch (err) {
      console.error(
        `[NotificationService] Unable to dispatch notification (title: "${data?.title || "unknown"}"): ${err.message}`
      );
      return null;
    }
  }

  // --- Helper: Find role IDs that have a specific permission ---
  // e.g., getRoleIdsByPermission("purchase", "request", "read")
  static async getRoleIdsByPermission(module, subModule, action = "read") {
    const query = { isActive: true };
    if (subModule) {
      query[`permissions.${module}.${subModule}.${action}`] = true;
    } else {
      query[`permissions.${module}.${action}`] = true;
    }
    const roles = await RoleModel.find(query).select("_id").lean();
    return roles.map((r) => r._id);
  }

  // --- 2. Get My Notifications (common + role + user + department + project) ---
  static async getMyNotifications(user, query) {
    const {
      page = 1,
      limit = 20,
      category,
      module,
      priority,
      readStatus,
    } = query;

    const skip = (page - 1) * limit;

    // Build audience filter — user sees notifications targeted at them
    const audienceConditions = [
      { audienceType: "common" },
      { audienceType: "user", users: user._id },
    ];

    if (user.role?._id) {
      audienceConditions.push({ audienceType: "role", roles: user.role._id });
    }
    if (user.department) {
      audienceConditions.push({
        audienceType: "department",
        departments: user.department,
      });
    }
    if (user.assignedProject?.length) {
      audienceConditions.push({
        audienceType: "project",
        projects: { $in: user.assignedProject },
      });
    }

    const filter = {
      isActive: true,
      $or: audienceConditions,
      // Exclude notifications this user has dismissed
      recipients: {
        $not: {
          $elemMatch: { userId: user._id, dismissed: true },
        },
      },
      // Only show notifications that are not scheduled for later
      $and: [
        {
          $or: [
            { scheduledAt: null },
            { scheduledAt: { $lte: new Date() } },
          ],
        },
      ],
    };

    // Optional filters
    if (category) filter.category = category;
    if (module) filter.module = module;
    if (priority) filter.priority = priority;

    const [notifications, total] = await Promise.all([
      NotificationModel.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .populate("createdBy", "name employeeId")
        .lean(),
      NotificationModel.countDocuments(filter),
    ]);

    // Attach read status per notification for this user
    const userId = user._id.toString();
    const enriched = notifications.map((n) => {
      const recipient = n.recipients?.find(
        (r) => r.userId?.toString() === userId
      );
      return {
        ...n,
        isRead: !!recipient?.readAt,
        readAt: recipient?.readAt || null,
        dismissed: !!recipient?.dismissed,
        recipients: undefined, // strip raw recipients from response
      };
    });

    // Filter by read status after enrichment if requested
    let result = enriched;
    if (readStatus === "read") {
      result = enriched.filter((n) => n.isRead);
    } else if (readStatus === "unread") {
      result = enriched.filter((n) => !n.isRead);
    }

    return {
      notifications: result,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // --- 3. Get Unread Count ---
  static async getUnreadCount(user) {
    const audienceConditions = [
      { audienceType: "common" },
      { audienceType: "user", users: user._id },
    ];

    if (user.role?._id) {
      audienceConditions.push({ audienceType: "role", roles: user.role._id });
    }
    if (user.department) {
      audienceConditions.push({
        audienceType: "department",
        departments: user.department,
      });
    }
    if (user.assignedProject?.length) {
      audienceConditions.push({
        audienceType: "project",
        projects: { $in: user.assignedProject },
      });
    }

    // Total notifications for this user
    const totalFilter = {
      isActive: true,
      $or: audienceConditions,
      $and: [
        {
          $or: [
            { scheduledAt: null },
            { scheduledAt: { $lte: new Date() } },
          ],
        },
      ],
    };

    const total = await NotificationModel.countDocuments(totalFilter);

    // Read notifications — those with a recipient entry with readAt set
    const readCount = await NotificationModel.countDocuments({
      ...totalFilter,
      recipients: {
        $elemMatch: { userId: user._id, readAt: { $ne: null } },
      },
    });

    return { total, read: readCount, unread: total - readCount };
  }

  // --- 4. Mark as Read ---
  static async markAsRead(notificationId, userId) {
    const notification = await NotificationModel.findById(notificationId);
    if (!notification) {
      const error = new Error(
        "Notification not found. Please verify the notification ID and try again."
      );
      error.statusCode = 404;
      throw error;
    }

    const existing = notification.recipients.find(
      (r) => r.userId?.toString() === userId.toString()
    );

    if (existing) {
      if (!existing.readAt) {
        existing.readAt = new Date();
        await notification.save();
      }
    } else {
      notification.recipients.push({ userId, readAt: new Date() });
      await notification.save();
    }

    return notification;
  }

  // --- 5. Mark All as Read ---
  static async markAllAsRead(user) {
    const audienceConditions = [
      { audienceType: "common" },
      { audienceType: "user", users: user._id },
    ];

    if (user.role?._id) {
      audienceConditions.push({ audienceType: "role", roles: user.role._id });
    }
    if (user.department) {
      audienceConditions.push({
        audienceType: "department",
        departments: user.department,
      });
    }
    if (user.assignedProject?.length) {
      audienceConditions.push({
        audienceType: "project",
        projects: { $in: user.assignedProject },
      });
    }

    // Find all notifications for this user (to mark unread ones as read)
    const allNotifications = await NotificationModel.find({
      isActive: true,
      $or: audienceConditions,
    }).select("_id recipients");

    const now = new Date();
    const bulkOps = [];

    for (const n of allNotifications) {
      const existing = n.recipients.find(
        (r) => r.userId?.toString() === user._id.toString()
      );

      if (!existing) {
        bulkOps.push({
          updateOne: {
            filter: { _id: n._id },
            update: {
              $push: { recipients: { userId: user._id, readAt: now } },
            },
          },
        });
      } else if (!existing.readAt) {
        bulkOps.push({
          updateOne: {
            filter: { _id: n._id, "recipients.userId": user._id },
            update: { $set: { "recipients.$.readAt": now } },
          },
        });
      }
    }

    if (bulkOps.length > 0) {
      await NotificationModel.bulkWrite(bulkOps);
    }

    return { markedCount: bulkOps.length };
  }

  // --- 6. Dismiss Notification ---
  static async dismiss(notificationId, userId) {
    const notification = await NotificationModel.findById(notificationId);
    if (!notification) {
      const error = new Error(
        "Notification not found. Please verify the notification ID and try again."
      );
      error.statusCode = 404;
      throw error;
    }

    const existing = notification.recipients.find(
      (r) => r.userId?.toString() === userId.toString()
    );

    if (existing) {
      existing.dismissed = true;
      if (!existing.readAt) existing.readAt = new Date();
    } else {
      notification.recipients.push({
        userId,
        readAt: new Date(),
        dismissed: true,
      });
    }

    await notification.save();
    return notification;
  }

  // --- 7. Get Notification by ID ---
  static async getById(notificationId) {
    const notification = await NotificationModel.findById(notificationId)
      .populate("createdBy", "name employeeId")
      .populate("roles", "roleName")
      .populate("users", "name employeeId department")
      .populate("projects", "tender_id tender_project_name");

    if (!notification) {
      const error = new Error(
        "Notification not found. Please verify the notification ID and try again."
      );
      error.statusCode = 404;
      throw error;
    }
    return notification;
  }

  // --- 8. Update Notification (admin) ---
  static async update(notificationId, data) {
    const notification = await NotificationModel.findByIdAndUpdate(
      notificationId,
      data,
      { new: true, runValidators: true }
    );
    if (!notification) {
      const error = new Error(
        "Notification not found. Unable to update a non-existent notification. Please verify the ID and try again."
      );
      error.statusCode = 404;
      throw error;
    }
    return notification;
  }

  // --- 9. Soft Delete (deactivate) ---
  static async delete(notificationId) {
    const notification = await NotificationModel.findByIdAndUpdate(
      notificationId,
      { isActive: false },
      { new: true }
    );
    if (!notification) {
      const error = new Error(
        "Notification not found. Unable to delete a non-existent notification. Please verify the ID and try again."
      );
      error.statusCode = 404;
      throw error;
    }
    return notification;
  }

  // --- 10. Get All Notifications (admin — with filters & pagination) ---
  static async getAll(query) {
    const {
      page = 1,
      limit = 20,
      audienceType,
      category,
      module,
      priority,
      search,
    } = query;

    const skip = (page - 1) * limit;
    const filter = { isActive: true };

    if (audienceType) filter.audienceType = audienceType;
    if (category) filter.category = category;
    if (module) filter.module = module;
    if (priority) filter.priority = priority;
    if (search) {
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.$or = [
        { title: { $regex: escaped, $options: "i" } },
        { message: { $regex: escaped, $options: "i" } },
      ];
    }

    const [notifications, total] = await Promise.all([
      NotificationModel.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .populate("createdBy", "name employeeId")
        .lean(),
      NotificationModel.countDocuments(filter),
    ]);

    return {
      notifications,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}

export default NotificationService;
