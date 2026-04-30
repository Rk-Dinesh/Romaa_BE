# HR — Frontend Integration Guide

This folder is the source of truth for integrating the Romaa HR backend with a frontend (web + mobile). Every endpoint that lives under the HR umbrella is documented here, with role-by-role UI design ideas alongside.

Last refreshed: 2026-04-30 (after the bug-fix + LeavePolicy + WeeklyOffPolicy + HOD layer overhaul).

---

## 1. Module map

```
                  ┌───────────────────────────┐
                  │  Calendar (Holiday)       │  ← single source for "is today a working day?"
                  │  + WeeklyOffPolicy        │     (per-department override of Sat/Sun rules)
                  └────────────┬──────────────┘
                               │
                               ▼
   ┌──────────────┐   ┌───────────────┐   ┌───────────────────────────┐
   │  Employee    │◄──┤  Department   ├──►│  LeavePolicy               │
   │  master      │   │  + HOD        │   │  (per-dept refill rules)  │
   └────┬───┬─────┘   └───────────────┘   └───────────────────────────┘
        │   │
        │   │ assigned_tenders / projects
        │   ▼
        │  Tender / Site (RLS)
        │
        ▼
   ┌──────────────┐
   │  Geofence    │
   └──────┬───────┘
          │
          ▼
   ┌──────────────────────────────────┐
   │  User Attendance                 │
   │  (multi-punch, sessions,         │
   │   regularization, reports)       │
   └────────────┬─────────────────────┘
                │
                │ daily/monthly aggregates
                ▼
   ┌──────────────────────────────────┐    ┌─────────────────────┐
   │  Leave Request                   │◄──►│  LeaveBalanceHistory│
   │  (apply, approve x3 stages,      │    │   (Debit/Credit/...) │
   │   withdraw, cancel, grant)       │    └─────────────────────┘
   └────────────┬─────────────────────┘
                │
                ▼
   ┌──────────────────────────────────┐
   │  Payroll                         │
   │  (generate, payslip, NEFT, TDS)  │
   └──────────────────────────────────┘

   Side flow: NMR Attendance — contractor labour, separate flow.
```

| Module | Doc | Base path |
|---|---|---|
| Employee + self-service + auth | [employee-api.md](employee-api.md) | `/employee` |
| User Attendance | [attendance-api.md](attendance-api.md) | `/attendance` |
| Holiday Calendar | [holidays-api.md](holidays-api.md) | `/calendar` |
| Leave (request + workflow) | [leave-api.md](leave-api.md) | `/leave` |
| Leave Policy (HR-controlled) | [leave-policy.md](leave-policy.md) | `/leavepolicy` |
| Weekly-Off Policy (HR-controlled) | [weekly-off-policy.md](weekly-off-policy.md) | `/weeklyoff` |
| Department + HOD directory | [department.md](department.md) | `/department` |
| Payroll | [payroll-api.md](payroll-api.md) | `/payroll` |
| Geofence master | [geofence-api.md](geofence-api.md) | `/geofence` |
| NMR Attendance (contractor) | [nmr-attendance.md](nmr-attendance.md) | `/nmrattendance` |

---

## 2. Authentication

- JWT delivered via the `accessToken` HTTP-only cookie (web) **or** `Authorization: Bearer <token>` header (mobile). Both work on every protected route.
- A second cookie `refreshToken` is used by the auth refresh route (`/auth/refresh`) and is set on login/mobile-login.
- `req.user` is populated by `verifyJWT` middleware with the full Employee document plus the populated `role`. The frontend never needs to send `employeeId` — the backend reads it from JWT.

### Login flow

```
POST /employee/login            { email, password }
     ↓
Cookies set: accessToken (1d), refreshToken (7d), both HttpOnly + Secure + SameSite=None
Response: { user (full employee), accessToken, refreshToken }
     ↓
Frontend stores user in app state; checks user.hasSeenOnboarding to gate the
onboarding tour; uses user.role.permissions to render menu items.
```

### Mobile vs web

`/employee/mobile-login` is the same shape but also returns the tokens in the JSON body, since mobile apps store them in secure storage rather than relying on cookies.

### Permission shape

```jsonc
user.role.permissions = {
  hr: {
    employee:   { create: true, read: true, edit: true, delete: false },
    attendance: { create: true, read: true, edit: true, delete: true  },
    leave:      { create: true, read: true, edit: true, delete: true  },
    payroll:    { create: false, read: true, edit: false, delete: false },
    geofence:   { create: false, read: true, edit: false, delete: false }
  },
  settings: { roles: { create:..., read:..., edit:..., delete:... } },
  ...
}
```

Use this map directly to enable/disable menu items, action buttons, and tab visibility.

---

## 3. Common response shape

All HR endpoints return JSON in this structure:

```jsonc
// Success — single object
{ "status": true, "message": "Optional", "data": { ... } }

// Success — list with pagination
{
  "status": true,
  "currentPage": 1,
  "totalPages": 5,
  "totalCount": 47,
  "data": [ ... ]
}

// Error
{ "status": false, "message": "Human-readable error" }
// HTTP status reflects the type:
//   400 — validation
//   401 — not authenticated
//   403 — authenticated but not allowed
//   404 — not found
//   409 — state conflict (e.g. "request is already Manager Approved")
//   500 — server error
```

Some legacy responses use `success` instead of `status`; both are present in the codebase. Frontend code should read whichever exists.

---

## 4. Pagination, search, and date-range filters

Every list endpoint that supports paging accepts:

| Query param | Meaning | Default | Cap |
|---|---|---|---|
| `page` | 1-based page | 1 | — |
| `limit` | items per page | 20 | 100 |
| `search` | regex-escaped match against name + employeeId (and module-specific fields) | none | — |
| `fromdate` | inclusive lower bound (ISO date) | open | — |
| `todate` | inclusive upper bound — backend normalises to end-of-day UTC | open | — |

Boolean filters are passed as the strings `"true"` / `"false"` in query params and are coerced server-side.

---

## 5. Date / time handling

- All dates stored at **UTC midnight** when they represent calendar dates (leave from/to, holiday date, attendance date).
- All timestamps stored at **wall clock UTC** with a parallel IST field for display where relevant (`istFirstIn`, `istLastOut`, `istTimestamp`).
- The frontend should convert UTC → user's local timezone for display.
- Time-of-day strings (shift start "09:00", short-leave window) are kept as `HH:mm` strings.

---

## 6. File uploads (S3 pattern)

Two endpoints accept multipart form-data:

| Endpoint | Purpose | Cap |
|---|---|---|
| `POST /attendance/photourl` | Punch photo | 1 MB |
| `POST /leave/attachment` | Medical certificate / proof | 5 MB |
| `POST /calendar/uploadcsv` | Bulk holiday import | (CSV) |

Each returns `{ fileUrl: "https://<bucket>.s3.<region>.amazonaws.com/<key>" }`. Frontend then puts that URL on the parent record (e.g. `LeaveRequest.attachmentUrl`).

---

## 7. Cron schedule (server-side)

The frontend doesn't trigger these, but it should be aware that data shifts at these times so it can refresh:

| Cron | Schedule (server time) | Effect |
|---|---|---|
| Daily Absenteeism Finalizer | 23:59 daily | marks Absent / auto-checkout / recomputes status |
| Monthly Leave Accrual | 00:05 on 1st | PL +2 etc; ProRata-on-hire one-shot |
| Year-End Reset | 23:55 on Dec 31 | resets CL/SL/Maternity/Paternity/Bereavement; PL CF cap; CompOff expiry; emits LeaveEncashment vouchers |
| Leave Reminder | every 6 hr | nudges approver for Pending > 12 hr |
| Leave SLA Escalation | 09:00 daily | escalates to HR when SLA breached |

After 23:59, the daily attendance summary (`/attendance/today-summary`) flips for that date. After 00:05 on the 1st, leave balances bump.

---

## 8. Permission matrix (frontend menu gating)

| UI area | Permission key |
|---|---|
| HR — Employees list & CRUD | `hr.employee.*` |
| HR — Reassign role / access mode | `settings.roles.edit` |
| HR — Departments + HOD | `hr.employee.*` |
| HR — Attendance reports + regularization approval | `hr.attendance.*` |
| HR — Holiday calendar editor + bulk upload | `hr.attendance.*` |
| HR — Weekly-off policy | `hr.attendance.*` |
| HR — Leave queue (all-pending, history scope=all) | `hr.leave.*` |
| HR — Leave policy editor | `hr.leave.*` |
| HR — Life-event grant | `hr.leave.create` |
| HR — Payroll generate / process / status / TDS / NEFT export | `hr.payroll.*` |
| HR — Geofence master | `hr.geofence.*` |

Self-service routes (`/employee/me/*`, `/leave/apply`, `/leave/withdraw`, `/leave/my-history`, `/attendance/punch`, etc.) are JWT-only — every authenticated user gets them.

---

## 9. Notification flow

Every workflow event emits an in-app notification through `NotificationService`. The frontend renders these via the existing `/notification` module. Each notification carries:

```jsonc
{
  title:        "Leave Approved",
  message:      "Your CL leave from 12/05 to 14/05 has been approved.",
  category:     "approval" | "alert" | "reminder" | "announcement" | "task",
  priority:     "low" | "medium" | "high",
  module:       "hr",
  reference:    { model: "LeaveRequest", documentId: "..." },
  actionUrl:    "/dashboard/profile",
  actionLabel:  "View Leave"
}
```

Use `category` to choose the icon and `priority` to choose the color. `reference` lets you deep-link directly to the affected record.

### Where notifications fire

| Event | Recipients |
|---|---|
| Leave applied | active manager (delegation-aware) |
| Leave moved to next stage | next stage's approvers (HOD or HR) |
| Leave approved (final) | applicant |
| Leave rejected | applicant |
| Leave SLA breached | HR roles with `hr.leave.edit` |
| Leave reminder | current approver (every 6 hr while Pending > 12 hr) |
| Regularization applied | HR roles with `hr.attendance.edit` |
| Regularization approved/rejected | applicant |
| Holiday added | every employee (announcement) |
| Comp-off credited (holiday work) | applicant |
| Role assigned / revoked | applicant |
| Project assigned | applicant |

---

## 10. Audit trail

Every HR collection has the audit plugin attached (`entity_type: "Employee"`, `"LeaveRequest"`, `"UserAttendance"`, etc.). The frontend gets at this through the cross-module `/audit` endpoints (not in this folder — see `src/module/audit/`). Useful for "who changed what and when" drilldowns.

---

## 11. Where to start (by persona)

| Building this | Read first |
|---|---|
| Login / onboarding screens | [employee-api.md](employee-api.md) §Auth |
| Mobile attendance app | [attendance-api.md](attendance-api.md) §Punch |
| Manager approval inbox | [leave-api.md](leave-api.md) §Approvals + §my-pending-approvals |
| HR admin console | [employee-api.md](employee-api.md), [department.md](department.md), [leave-policy.md](leave-policy.md), [weekly-off-policy.md](weekly-off-policy.md) |
| Payroll month-end screen | [payroll-api.md](payroll-api.md) |
| Reports dashboard | [attendance-api.md](attendance-api.md) §Reports |
| Geofence master | [geofence-api.md](geofence-api.md) |

---

## 12. UI design system — shared building blocks

These components are referenced throughout the per-module files; defining them once here keeps the rest of the docs consistent.

### Status pill colors

Use the same pill style across modules so users learn one mapping:

| Status | Hue | Where it appears |
|---|---|---|
| Pending | amber | leave, regularization |
| Processing | grey (with spinner) | leave (transient — usually not shown) |
| Manager Approved | sky | leave |
| HOD Approved | indigo | leave |
| HR Approved / Approved | green | leave, regularization |
| Rejected | red | leave, regularization |
| Cancelled | slate | leave |
| Present | green | attendance |
| Absent | red | attendance |
| Half-Day | amber | attendance |
| On Leave | blue | attendance |
| Holiday | violet | attendance |
| Late Entry | orange | attendance flag |

### Empty / loading / error states

Every list view should support all three. Backend pagination always returns `{ data: [], totalCount: 0 }` for empty (never 404).

### Bulk-action toolbars

Manager and HR list views (leave queue, regularization queue) should support multi-select with a sticky toolbar offering Approve / Reject / Bulk-Cancel. The leave module already has `POST /leave/action-bulk` for this.

### Date pickers

A single shared `<DateRangePicker />` is reused everywhere. Always sends ISO `YYYY-MM-DD`. Auto-disable non-working days when the user has a leave-application context (call `/calendar/list` + `/weeklyoff/preview` to know which days are off for that employee's department).

### Role-aware navigation

Read `req.user.role.permissions` on app boot and gate the sidebar items. Don't rely on backend 403s as the only signal — they're the safety net, not the UX.

### Calendar widget (attendance + holidays)

Color-code each cell by status. Stack a small badge for late/early/regularized states. Tap → drill-down modal with the day's full timeline.

### Approver context drawer

When opening a leave request to approve, show:
- Applicant card (photo, name, designation, dept)
- Live balance (`/leave/balance-history?employeeId=...`)
- Team coverage in the same window (manager-bot only — derived from `/leave/all-pending` filtered by date overlap)
- Workflow log (the request's `workflowLogs[]` array — Applied → Approved → … → Reminded → Escalated)

---

## 13. Cross-module data dependencies

Knowing these saves a lot of "why is this empty?" debugging.

| Frontend feature | Depends on |
|---|---|
| Apply leave form's "available balance" hint | Employee.leaveBalance + LeavePolicyService.preview (`/leavepolicy/preview`) |
| Apply leave form's non-working-day grey-out | `/calendar/list` (year) + `/weeklyoff/preview` (range) |
| Manager approval inbox | `/leave/my-pending-approvals` (returns asManager + asHOD + asHR buckets) |
| HR dashboard tiles | `/attendance/today-summary` |
| Payslip PDF render | `/payroll/payslip/:id` (frontend renders to PDF) |
| Department dropdown anywhere | `/department/list` |
| Holiday calendar component | `/calendar/list?year=YYYY` |

---

## 14. Conventions for API errors that need special UI

| Status code | UI treatment |
|---|---|
| 400 | inline validation, do not navigate away |
| 401 | redirect to login, clear app state |
| 403 | toast "Not authorized", hide the action button if it persists |
| 404 | empty-state in the page being viewed |
| 409 | toast with the message verbatim — these are usually state-machine conflicts the user can act on ("request is already HR Approved") |
| 429 | inline message with the cooldown ("Try again in 15 minutes") — both `/employee/login` and `/employee/forgot-password` rate-limit |
| 5xx | global error boundary; offer a "Retry" button |

---

## 15. Local development

```
PORT (e.g. 4500)
MONGO_URI
ACCESS_TOKEN_SECRET / EXPIRY (default 1d)
REFRESH_TOKEN_SECRET / EXPIRY (default 7d)
FRONTEND_URL
AWS_REGION + AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY + AWS_S3_BUCKET
```

`npm run dev` boots Express with nodemon. CORS allow-list includes `http://localhost:5173` and `http://localhost:3000` plus `FRONTEND_URL`.

Swagger UI is mounted at `/api/docs` — useful for exploring requests, but the human-friendly contract is right here in the per-module files.
