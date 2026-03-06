# Notification API - Frontend Integration Guide

Base URL: `/notification`
Auth: All endpoints require JWT token (cookie or `Authorization: Bearer <token>` header)

---

## Endpoints Overview

| # | Method | Endpoint | Purpose | Who |
|---|--------|----------|---------|-----|
| 1 | `GET` | `/notification/my` | Get my notifications | Any user |
| 2 | `GET` | `/notification/unread-count` | Get unread badge count | Any user |
| 3 | `PATCH` | `/notification/:id/read` | Mark one as read | Any user |
| 4 | `PATCH` | `/notification/read-all` | Mark all as read | Any user |
| 5 | `PATCH` | `/notification/:id/dismiss` | Dismiss notification | Any user |
| 6 | `GET` | `/notification/all` | List all (admin panel) | Admin |
| 7 | `GET` | `/notification/:id` | Get full detail | Admin |
| 8 | `POST` | `/notification/` | Create notification | Admin |
| 9 | `PUT` | `/notification/:id` | Update notification | Admin |
| 10 | `DELETE` | `/notification/:id` | Soft delete | Admin |

---

## 1. Get My Notifications

Fetches all notifications relevant to the logged-in user based on their role, department, assigned projects, and common announcements.

```
GET /notification/my
```

**Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `page` | number | `1` | Page number |
| `limit` | number | `20` | Items per page |
| `category` | string | - | Filter: `announcement`, `approval`, `task`, `alert`, `reminder`, `system` |
| `module` | string | - | Filter: `dashboard`, `tender`, `project`, `purchase`, `site`, `hr`, `finance`, `report`, `settings`, `system` |
| `priority` | string | - | Filter: `low`, `medium`, `high`, `critical` |
| `readStatus` | string | - | Filter: `read`, `unread` (omit for all) |

**Example:**
```
GET /notification/my?page=1&limit=10&readStatus=unread&category=approval
```

**Response:**
```json
{
  "status": true,
  "data": {
    "notifications": [
      {
        "_id": "665f1a2b3c4d5e6f7a8b9c0d",
        "title": "New Purchase Request",
        "message": "PR #PR-045 requires your approval",
        "audienceType": "role",
        "category": "approval",
        "priority": "high",
        "module": "purchase",
        "actionUrl": "/purchase/request/665f1a2b3c4d5e6f7a8b9c0e",
        "actionLabel": "View Request",
        "channels": ["in_app"],
        "isActive": true,
        "createdBy": {
          "_id": "665f1a2b3c4d5e6f7a8b9c0f",
          "name": "John Admin",
          "employeeId": "EMP-001"
        },
        "createdAt": "2026-03-06T10:30:00.000Z",
        "updatedAt": "2026-03-06T10:30:00.000Z",
        "isRead": false,
        "readAt": null,
        "dismissed": false
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 25,
      "totalPages": 3
    }
  }
}
```

**How audience matching works:**
The API automatically returns notifications that match ANY of these criteria for the logged-in user:
- `audienceType: "common"` - visible to everyone
- `audienceType: "role"` - user's role ID is in the `roles` array
- `audienceType: "user"` - user's ID is in the `users` array
- `audienceType: "department"` - user's department is in the `departments` array
- `audienceType: "project"` - any of user's assigned projects is in the `projects` array

No frontend filtering needed - the backend handles all targeting logic.

---

## 2. Get Unread Count

Use this for the notification bell badge.

```
GET /notification/unread-count
```

**Response:**
```json
{
  "status": true,
  "data": {
    "total": 25,
    "read": 18,
    "unread": 7
  }
}
```

**Recommended polling interval:** Every 30-60 seconds, or on page focus.

---

## 3. Mark as Read

Call when user clicks/opens a notification.

```
PATCH /notification/:id/read
```

**Response:**
```json
{
  "status": true,
  "message": "Notification marked as read"
}
```

---

## 4. Mark All as Read

"Mark all as read" button in notification panel.

```
PATCH /notification/read-all
```

**Response:**
```json
{
  "status": true,
  "message": "All notifications marked as read",
  "data": {
    "markedCount": 7
  }
}
```

---

## 5. Dismiss Notification

Remove from user's feed without deleting (auto-marks as read too).

```
PATCH /notification/:id/dismiss
```

**Response:**
```json
{
  "status": true,
  "message": "Notification dismissed"
}
```

---

## 6. Get All Notifications (Admin)

Admin panel view to manage all notifications system-wide.

```
GET /notification/all
```

**Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `page` | number | `1` | Page number |
| `limit` | number | `20` | Items per page |
| `audienceType` | string | - | Filter: `common`, `role`, `user`, `project`, `department` |
| `category` | string | - | Filter by category |
| `module` | string | - | Filter by module |
| `priority` | string | - | Filter by priority |
| `search` | string | - | Search in title and message |

**Example:**
```
GET /notification/all?audienceType=role&module=purchase&search=approval
```

**Response:**
```json
{
  "status": true,
  "data": {
    "notifications": [
      {
        "_id": "665f1a2b3c4d5e6f7a8b9c0d",
        "title": "New Purchase Request",
        "message": "PR #PR-045 requires your approval",
        "audienceType": "role",
        "roles": ["665f1a2b3c4d5e6f7a8b0001"],
        "users": [],
        "projects": [],
        "departments": [],
        "recipients": [
          {
            "userId": "665f1a2b3c4d5e6f7a8b9c0f",
            "readAt": "2026-03-06T11:00:00.000Z",
            "deliveredAt": null,
            "dismissed": false
          }
        ],
        "category": "approval",
        "priority": "high",
        "module": "purchase",
        "channels": ["in_app"],
        "isActive": true,
        "createdBy": {
          "_id": "665f1a2b3c4d5e6f7a8b9c0f",
          "name": "John Admin",
          "employeeId": "EMP-001"
        },
        "createdAt": "2026-03-06T10:30:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 50,
      "totalPages": 3
    }
  }
}
```

---

## 7. Get Notification by ID

Full detail view with populated references.

```
GET /notification/:id
```

**Response:**
```json
{
  "status": true,
  "data": {
    "_id": "665f1a2b3c4d5e6f7a8b9c0d",
    "title": "New Purchase Request",
    "message": "PR #PR-045 requires your approval",
    "audienceType": "role",
    "roles": [
      { "_id": "665f1a2b3c4d5e6f7a8b0001", "roleName": "PURCHASE MANAGER" }
    ],
    "users": [],
    "projects": [],
    "departments": [],
    "category": "approval",
    "priority": "high",
    "module": "purchase",
    "reference": {
      "model": "PurchaseRequest",
      "documentId": "665f1a2b3c4d5e6f7a8b9c0e"
    },
    "actionUrl": "/purchase/request/665f1a2b3c4d5e6f7a8b9c0e",
    "actionLabel": "View Request",
    "channels": ["in_app"],
    "scheduledAt": null,
    "expiresAt": null,
    "isActive": true,
    "createdBy": {
      "_id": "665f1a2b3c4d5e6f7a8b9c0f",
      "name": "John Admin",
      "employeeId": "EMP-001"
    },
    "createdAt": "2026-03-06T10:30:00.000Z"
  }
}
```

---

## 8. Create Notification (Admin)

```
POST /notification/
```

**Request Body:**

```json
{
  "title": "Office closed on Holi",
  "message": "The office will remain closed on March 14th for Holi celebrations.",
  "audienceType": "common",
  "category": "announcement",
  "priority": "medium",
  "module": "hr"
}
```

### Body Fields:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | string | Yes | Notification title |
| `message` | string | Yes | Notification body |
| `audienceType` | string | Yes | `common`, `role`, `user`, `project`, `department` |
| `roles` | ObjectId[] | If audienceType=role | Array of Role IDs |
| `users` | ObjectId[] | If audienceType=user | Array of Employee IDs |
| `projects` | ObjectId[] | If audienceType=project | Array of Tender/Project IDs |
| `departments` | string[] | If audienceType=department | Array of department names |
| `category` | string | No | `announcement`, `approval`, `task`, `alert`, `reminder`, `system` (default: `alert`) |
| `priority` | string | No | `low`, `medium`, `high`, `critical` (default: `medium`) |
| `module` | string | No | `dashboard`, `tender`, `project`, `purchase`, `site`, `hr`, `finance`, `report`, `settings`, `system` |
| `reference` | object | No | `{ model: "ModelName", documentId: "ObjectId" }` |
| `channels` | string[] | No | `["in_app"]`, `["in_app", "email"]` (default: `["in_app"]`) |
| `actionUrl` | string | No | Frontend route to navigate on click |
| `actionLabel` | string | No | Button/link text (e.g., "View Request") |
| `scheduledAt` | ISO date | No | Schedule for later delivery |
| `expiresAt` | ISO date | No | Auto-delete after this date (TTL) |

### Example Request Bodies:

**Common (all users):**
```json
{
  "title": "System maintenance tonight",
  "message": "The system will be down from 11 PM to 2 AM for maintenance.",
  "audienceType": "common",
  "category": "system",
  "priority": "high",
  "module": "system"
}
```

**Role-based:**
```json
{
  "title": "3 Purchase Orders pending approval",
  "message": "You have pending purchase orders that need your review.",
  "audienceType": "role",
  "roles": ["665f1a2b3c4d5e6f7a8b0001", "665f1a2b3c4d5e6f7a8b0002"],
  "category": "approval",
  "priority": "high",
  "module": "purchase",
  "actionUrl": "/purchase/orders?status=pending",
  "actionLabel": "Review Orders"
}
```

**User-specific:**
```json
{
  "title": "Your leave has been approved",
  "message": "Your leave request for March 10-12 has been approved by your manager.",
  "audienceType": "user",
  "users": ["665f1a2b3c4d5e6f7a8b9c10"],
  "category": "approval",
  "priority": "medium",
  "module": "hr",
  "actionUrl": "/hr/leave/my-requests",
  "actionLabel": "View Leave"
}
```

**Department-based:**
```json
{
  "title": "Safety drill scheduled",
  "message": "All Civil and Electrical department staff must attend the safety drill on March 15th.",
  "audienceType": "department",
  "departments": ["Civil", "Electrical"],
  "category": "announcement",
  "priority": "medium",
  "module": "hr"
}
```

**Project-based:**
```json
{
  "title": "Schedule updated for Highway Project",
  "message": "The project schedule has been revised. Please check the updated milestones.",
  "audienceType": "project",
  "projects": ["665f1a2b3c4d5e6f7a8b9c20"],
  "category": "task",
  "priority": "medium",
  "module": "project",
  "actionUrl": "/project/schedule/665f1a2b3c4d5e6f7a8b9c20",
  "actionLabel": "View Schedule"
}
```

**Scheduled + Expiry:**
```json
{
  "title": "Reminder: Timesheet submission",
  "message": "Please submit your weekly timesheet by end of day.",
  "audienceType": "common",
  "category": "reminder",
  "priority": "medium",
  "module": "hr",
  "scheduledAt": "2026-03-07T09:00:00.000Z",
  "expiresAt": "2026-03-07T23:59:59.000Z"
}
```

**Response (201):**
```json
{
  "status": true,
  "message": "Notification created successfully",
  "data": { ... }
}
```

---

## 9. Update Notification (Admin)

```
PUT /notification/:id
```

**Request Body:** Any fields from the create body (partial update supported).

```json
{
  "title": "Updated: Office closed on Holi",
  "priority": "high"
}
```

**Response:**
```json
{
  "status": true,
  "message": "Notification updated successfully",
  "data": { ... }
}
```

---

## 10. Delete Notification (Admin)

Soft delete - sets `isActive: false`. Notification disappears from all feeds.

```
DELETE /notification/:id
```

**Response:**
```json
{
  "status": true,
  "message": "Notification deleted successfully"
}
```

---

## Enums Reference

### audienceType
| Value | Description |
|-------|-------------|
| `common` | All logged-in users |
| `role` | Users with matching role IDs in `roles[]` |
| `user` | Specific users by ID in `users[]` |
| `department` | Users whose `department` field matches any value in `departments[]` |
| `project` | Users assigned to any project in `projects[]` |

### category
| Value | Suggested UI Icon | Description |
|-------|-------------------|-------------|
| `announcement` | Megaphone | Company-wide announcements |
| `approval` | Check circle | Pending approvals / approval results |
| `task` | Clipboard | Task assignments and updates |
| `alert` | Warning triangle | Alerts and warnings |
| `reminder` | Clock | Scheduled reminders |
| `system` | Gear | System-generated notifications |

### priority
| Value | Suggested UI |
|-------|-------------|
| `low` | Grey/muted |
| `medium` | Default style |
| `high` | Orange/warning |
| `critical` | Red/danger |

### module
`dashboard`, `tender`, `project`, `purchase`, `site`, `hr`, `finance`, `report`, `settings`, `system`

### channels
`in_app`, `email`, `push`, `sms` (currently only `in_app` is active)

---

## Frontend Integration Tips

### Notification Bell Component
```
1. On mount / page focus:  GET /notification/unread-count  ->  show badge with `unread`
2. On bell click:          GET /notification/my?limit=10   ->  render dropdown list
3. On notification click:  PATCH /notification/:id/read    ->  navigate to `actionUrl`
4. On "Mark all read":     PATCH /notification/read-all    ->  refresh list & badge
5. On dismiss (x button):  PATCH /notification/:id/dismiss ->  remove from list
```

### Polling Strategy
- Poll `GET /notification/unread-count` every 30-60 seconds for badge updates
- Full list fetch only when user opens the notification panel
- Stop polling when tab is not visible (`document.hidden`)

### Notification Item Rendering
```
- Use `category` for icon selection
- Use `priority` for visual styling (border color, background)
- Use `module` for grouping/filtering tabs
- Use `actionUrl` + `actionLabel` for clickable navigation
- Use `isRead` to toggle read/unread styling
- Use `createdAt` for relative time display ("2 hours ago")
```

### Admin Panel
```
- GET /notification/all      ->  table with filters (audienceType, category, module, search)
- POST /notification/        ->  create form with audience type selector
- PUT /notification/:id      ->  edit form (pre-fill from GET /:id)
- DELETE /notification/:id   ->  confirm dialog -> soft delete
```
