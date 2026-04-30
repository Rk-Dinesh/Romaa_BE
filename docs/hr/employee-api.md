# Employee + Self-Service + Auth

Base path: `/employee` — covers employee master CRUD, authentication (web + mobile), password recovery, role/access management, and employee-facing self-service (profile, my-team, comp-off balance, delegation).

See [README.md](README.md) for shared conventions.

---

## 1. Data model — what a frontend needs to know

```jsonc
{
  _id, employeeId,         // "EMP-001" — used as business key
  name, email, phone,
  password (write-only),
  role: { _id, roleName, permissions: { hr: {...}, settings: {...} } },
  status: "Active" | "Inactive" | "Suspended",
  hrStatus: "Probation" | "Confirmed" | "Notice Period" | "Relieved",
  userType: "Office" | "Site",
  shiftType: "General" | "Night" | "Morning" | "Flexible",
  accessMode: "WEBSITE" | "MOBILE" | "BOTH",
  department, designation, dateOfJoining,
  reportsTo (Employee _id),
  delegateTo (Employee _id), delegateUntil,
  assignedProject: [Tender _id], assigned_tenders: [String],
  address: { street, city, state, pincode },
  emergencyContact: { name, relationship, phone },
  idProof: { type, number },
  photoUrl,
  hasSeenOnboarding,
  leaveBalance: { CL, SL, PL, Maternity, Paternity, Bereavement,
                  compOff: [{earnedDate, expiryDate, isUsed, reason}] },
  payroll: { basicSalary, accountHolderName, bankName, accountNumber,
             ifscCode, uanNumber, panNumber }
}
```

`password` and `refreshToken` are never returned. `leaveBalance.compOff` is a sub-array of credits; numeric fields are simple numbers.

---

## 2. Endpoint catalog

### Authentication (public)

| Method | Path | Rate limit | Use |
|---|---|---|---|
| POST | `/employee/login` | 10 / 15 min | web login (sets cookies) |
| POST | `/employee/mobile-login` | 10 / 15 min | mobile login (returns tokens in body too) |
| POST | `/employee/logout` | — | clears cookies |
| POST | `/employee/forgot-password` | 5 / hr | sends OTP email |
| POST | `/employee/reset-password-with-otp` | 5 / hr | verify OTP + set new password |

### Authentication (JWT)

| Method | Path | Use |
|---|---|---|
| POST | `/employee/reset-password` | logged-in password change (oldPassword → newPassword) |
| PATCH | `/employee/update-onboarding-status` | mark `hasSeenOnboarding: true` |

### Self-service (JWT)

| Method | Path | Use |
|---|---|---|
| PUT | `/employee/me/profile` | edit phone/address/emergencyContact/photoUrl/idProof + payroll bank fields |
| GET | `/employee/me/team` | direct reports + each one's today's attendance snapshot |
| GET | `/employee/me/compoff-balance` | comp-off ledger (valid + expired + used). Cross-user query needs `hr.leave.read`. |
| PUT | `/employee/me/delegation` | set out-of-office delegation `{ delegateTo, delegateUntil }` |
| DELETE | `/employee/me/delegation` | clear delegation |

### CRUD (HR-permission)

| Method | Path | Permission |
|---|---|---|
| POST | `/employee/register` | `hr.employee.create` |
| GET | `/employee/list` | `hr.employee.read` |
| GET | `/employee/getbyId/:employeeId` | `hr.employee.read` |
| PUT | `/employee/update/:employeeId` | `hr.employee.edit` |
| DELETE | `/employee/delete/:employeeId` | `hr.employee.delete` (soft-delete) |
| GET | `/employee/role/filter?role=NAME` | `hr.employee.read` |
| GET | `/employee/with-roles` | `hr.employee.read` |
| GET | `/employee/unassigned` | `hr.employee.read` |
| GET | `/employee/assigned` | `hr.employee.read` |
| PUT | `/employee/update-access/:employeeId` | `settings.roles.edit` |
| PUT | `/employee/role/re-assign` | `settings.roles.edit` |
| PUT | `/employee/assign-projects` | `hr.employee.edit` |

---

## 3. Detailed specs

### POST `/employee/login`

```jsonc
// Request
{ "email": "user@romaa.com", "password": "..." }

// 200 — sets accessToken + refreshToken cookies (HttpOnly, Secure, SameSite=None)
{
  "status": true,
  "message": "User logged in successfully",
  "data": { "user": {/* full Employee w/ role populated */} }
}

// 401 — wrong creds OR account not found
{ "status": false, "message": "Incorrect password..." }
// 429 — rate-limited
```

UI:
- Standard email + password form. Show "Forgot password?" link.
- After 200, route to dashboard. If `data.user.hasSeenOnboarding === false`, run the onboarding tour first.
- Persist `data.user` in app state. Don't re-fetch on every screen.

### POST `/employee/mobile-login`

Same as login but the response body also carries `accessToken` and `refreshToken` for mobile secure-storage. Use this on React Native / Flutter clients.

### POST `/employee/forgot-password` + `/employee/reset-password-with-otp`

Two-step flow:

```jsonc
// Step 1
POST /employee/forgot-password   { "email": "..." }
// → 200: "OTP sent to email" (6-digit OTP, 5-min expiry, hashed before save)
// → 404: account not found

// Step 2
POST /employee/reset-password-with-otp  { "email", "otp", "newPassword" }
// newPassword min length 6
// → 200: "Password reset successfully"
// → 400: invalid OTP / expired
```

UI:
- Single-page wizard. Step 1: email → "Send OTP". Step 2: OTP + new password (with confirmation field) → "Reset". Step 3: "Done — log in now".
- Show countdown timer for the 5-min expiry.

### POST `/employee/reset-password` (logged-in)

```jsonc
{ "oldPassword": "...", "newPassword": "..." }
```

UI: standard "Change password" form in Settings.

### PATCH `/employee/update-onboarding-status`

```jsonc
// no body
{ "status": true, "hasSeenOnboarding": true }
```

Call once when the new-user tour completes. After this, the user object's `hasSeenOnboarding` is true on next login so the tour doesn't repeat.

### PUT `/employee/me/profile`

```jsonc
// Editable subset
{
  "phone": "...",
  "address": { "street", "city", "state", "pincode" },
  "emergencyContact": { "name", "relationship", "phone" },
  "photoUrl": "https://...s3.../emp-photo.jpg",
  "idProof": { "type": "Aadhaar", "number": "..." },
  "payroll": {
    "accountHolderName", "bankName", "accountNumber", "ifscCode",
    "uanNumber", "panNumber"
  }
}
```

Server allow-lists exactly these fields — anything else is silently ignored. `name`, `email`, `role`, `status`, `leaveBalance`, `payroll.basicSalary` cannot be changed by the employee.

UI:
- Settings → Profile screen with three sections: Personal, Emergency, Bank.
- Photo upload pattern: call `/attendance/photourl` (the same multipart endpoint used for punch photos works fine), receive `fileUrl`, then `PUT /me/profile` with `photoUrl` set.
- Show a banner "Bank changes will reflect in payroll from next month" so the user has expectations right.

### GET `/employee/me/team`

```jsonc
// Response
{
  "status": true,
  "data": [
    {
      "_id", "employeeId", "name", "email", "designation", "department",
      "photoUrl", "status", "shiftType",
      "today": {
        "status": "Present" | "Absent" | "Half-Day" | "On Leave" | "Holiday" | "Not Punched Yet",
        "firstIn", "lastOut", "netWorkHours", "isLate"
      }
    },
    ...
  ]
}
```

UI (manager dashboard):
- Card grid, one card per direct report. Photo, name, designation, today's status pill, in/out times.
- Tap a card → drill into that employee's monthly attendance calendar.
- Empty state: "No direct reports yet — ask HR to set your team's `reportsTo` field".

### GET `/employee/me/compoff-balance`

```jsonc
// Response
{
  "status": true,
  "data": {
    "totalValid": 3,
    "validCredits": [
      { "earnedDate", "expiryDate", "isUsed": false, "reason": "Holiday work on 2026-01-26 (1 day)", "isExpired": false },
      ...
    ],
    "allCredits": [/* validCredits + used + expired */]
  }
}
```

UI:
- Settings → Leave → Comp-Off ledger. Show a list with three pills: "Valid" (count = totalValid), "Used", "Expired".
- For each valid credit show "Earned 26-Jan, expires 27-Mar (in N days)".
- Cross-user view (HR): pass `?employeeId=...` and the backend gates by `hr.leave.read`.

### PUT `/employee/me/delegation`

```jsonc
// Request
{ "delegateTo": "<Employee _id>", "delegateUntil": "2026-05-15T23:59:59Z" }

// 400 — delegating to self / target not active
```

UI: "Out of office" toggle in user menu. Pick someone from the team via a typeahead (call `/employee/list` with search). Pick a return date. Save. While active, the badge says "Delegating to <name> until <date>". Manager's leave-approval inbox of the delegate now shows your team's leaves too.

### DELETE `/employee/me/delegation`

Toggle off. Returns the cleared record.

### POST `/employee/register`

Create a new employee. The server auto-generates `employeeId` ("EMP-001"). Required: `name`, `email`, `phone`, `password`. Recommended at create-time: `role`, `userType`, `department`, `designation`, `dateOfJoining`, `reportsTo`. After save, the `applyProRataOnHire` hook fires automatically to credit pro-rated CL/SL/PL/Maternity/Paternity/Bereavement based on `dateOfJoining`.

UI: HR multi-step form. Step 1 Identity, Step 2 Role + access mode, Step 3 Compensation (basic salary, bank). Show in a side panel a preview of the pro-rated leave balances they'll start with based on `dateOfJoining` (mid-year hires get less).

### GET `/employee/list`

Paginated. Query: `page, limit, search, fromdate, todate` (joining_date range).

UI: HR Employees page — filterable data table. Row actions: Edit, Reassign role, Assign projects, Soft-delete.

### GET `/employee/getbyId/:employeeId`

Single employee by business ID (e.g. `EMP-042`). Populates `role` and `assignedProject`.

### PUT `/employee/update/:employeeId`

HR can edit any field except sensitive ones (password, refreshToken). Body is a partial — only fields you send are changed.

### DELETE `/employee/delete/:employeeId`

Soft-delete: `isDeleted=true, status=Inactive`. Existing leave/attendance records are preserved.

UI: confirm-modal with "Are you sure? This deactivates the account; their attendance and leave records remain."

### GET `/employee/role/filter?role=ROLE_NAME`

All active employees with the given role name. Useful for dropdowns like "select a Site Engineer".

### GET `/employee/with-roles` / `/employee/unassigned` / `/employee/assigned`

Filtering helpers for the access-management screen:
- `with-roles` → employees that have a role attached
- `unassigned` → role is null
- `assigned` → role is non-null (light projection)

### PUT `/employee/update-access/:employeeId`

```jsonc
{
  "role": "<Role _id>",         // optional — change role
  "status": "Active",           // optional
  "password": "...",            // optional — bcrypted before save
  "accessMode": "BOTH"          // WEBSITE | MOBILE | BOTH
}
```

Permission: `settings.roles.edit`.

### PUT `/employee/role/re-assign`

```jsonc
{ "employeeId": "EMP-042", "roleId": "<Role _id>" | null, "accessMode": "..." }
```

Setting `roleId: null` revokes access (also clears password and accessMode). Notification fires.

### PUT `/employee/assign-projects`

```jsonc
{ "employeeId": "EMP-042", "assignedProject": ["<Tender _id>", ...] }
```

The Tender IDs are validated to exist before save. RLS on Site users uses `assigned_tenders` (string business keys) instead — that's set elsewhere.

---

## 4. UI design ideas

### Persona: Employee (self-service)

- **Top bar**: avatar + bell + delegation badge ("Delegating to Priya until 14 May")
- **Profile screen**: three tabs Personal / Bank / Documents, each with inline edit + Save bar at the bottom
- **Comp-off page**: ledger with the three pills, plus "Apply CompOff" CTA → opens the leave-application form pre-filled with `leaveType=CompOff`

### Persona: Manager

- **My Team page**: card grid (`/me/team`) — quick visual on who's in, who's late, who's on leave today
- **Approval inbox**: left rail counts (Manager / HOD / HR if you wear those hats) → see leave docs

### Persona: HR

- **Employees page**: data table with filters (department, status, hrStatus, role, joining date)
- **New employee wizard**: 3 steps with inline validation, ProRata preview at the end before "Save"
- **Access Management**: split view — left list of employees, right detail panel for role/status/accessMode/password reset

### Persona: System Admin (DEV role)

- Full access across the above plus the audit trail (`/audit`) for forensic.

---

## 5. Integration notes / gotchas

- `employeeId` ("EMP-042") is the business ID used in URLs and across the UI. The Mongo `_id` is opaque — never show it.
- After `PUT /me/delegation`, the delegate's `/leave/my-pending-approvals?asManager` will start including your team within ~immediately (no cache).
- `password` is `select: false` — even if you query Employee directly, you won't see it. There's no admin "view password" feature by design.
- Soft-deleted employees are excluded from every list (`isDeleted: { $ne: true }`). To see them, query the audit log.
- `hasSeenOnboarding` is a single boolean. If you want to re-trigger the tour, you'd have to write your own front-end flag — the backend has no "reset onboarding".
- Rate limits on `/login` and OTP routes: surface the 429 message inline so users see "Try again in 15 minutes".

---

## 6. Cross-references

- Login + permissions → drives sidebar gating across all HR modules.
- `dateOfJoining` → triggers ProRata via `LeavePolicyService` (see [leave-policy.md](leave-policy.md)).
- `reportsTo` + `delegateTo` → drives the manager's approval queue (see [leave-api.md](leave-api.md) §Approvals).
- `department` (string) → matched by [department.md](department.md) for HOD resolution and by [weekly-off-policy.md](weekly-off-policy.md) for working-day rules.
- `assignedProject` → drives RLS for Site employees (see CLAUDE.md).
