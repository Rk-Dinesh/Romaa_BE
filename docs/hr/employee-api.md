# Employee API

Base path: `/employee`

All CRUD routes require a valid JWT (`Authorization: Bearer <token>` or `accessToken` cookie).

---

## Auth (public)

### POST `/employee/login`
Login with email + password.

**Rate limit:** 10 requests / 15 min

**Request body:**
```json
{ "email": "john@example.com", "password": "secret" }
```

**Response `200`:**
```json
{
  "status": true,
  "data": {
    "user": { "_id": "...", "name": "John", "role": { "permissions": {} }, ... },
    "accessToken": "<jwt>",
    "refreshToken": "<jwt>"
  }
}
```

---

### POST `/employee/mobile-login`
Same payload as `/login`. Returns same shape.

---

### POST `/employee/forgot-password`
Send OTP to employee email.

**Rate limit:** 5 requests / 1 hr

**Request body:**
```json
{ "email": "john@example.com" }
```

---

### POST `/employee/reset-password-with-otp`
Reset password using OTP.

**Request body:**
```json
{ "email": "john@example.com", "otp": "123456", "newPassword": "newpass" }
```

---

### POST `/employee/logout`
Clears `accessToken` and `refreshToken` cookies.

---

## Employee CRUD (requires JWT + HR permission)

### POST `/employee/register`
Create a new employee. Permission: `hr.employee.create`

**Request body:**
```json
{
  "name": "Jane Doe",
  "email": "jane@company.com",
  "phone": "9876543210",
  "designation": "Engineer",
  "department": "Civil",
  "dateOfJoining": "2024-01-15",
  "userType": "Office",
  "shiftType": "General",
  "role": "<roleId>",
  "address": { "street": "...", "city": "Mumbai", "state": "MH", "pincode": "400001" }
}
```

**Response `201`:**
```json
{ "status": true, "message": "Employee created", "data": { "employeeId": "EMP-004", ... } }
```

---

### GET `/employee/list`
Paginated employee list. Permission: `hr.employee.read`

**Query params:** `?page=1&limit=10&search=jane&department=Civil&status=Active`

---

### GET `/employee/getbyId/:employeeId`
Fetch a single employee by MongoDB `_id`. Permission: `hr.employee.read`

---

### PUT `/employee/update/:employeeId`
Update employee profile fields. Permission: `hr.employee.edit`

---

### DELETE `/employee/delete/:employeeId`
Soft-deletes the employee (`isDeleted: true`, `status: Inactive`). Permission: `hr.employee.delete`

---

## Role & Access Management

### PUT `/employee/role/re-assign`
Assign or revoke a role. Permission: `settings.roles.edit`

```json
{ "employeeId": "<id>", "roleId": "<roleId>" }
```

### PUT `/employee/update-access/:employeeId`
Update `role`, `status`, `accessMode`, or `shiftType`. Permission: `settings.roles.edit`

### PUT `/employee/assign-projects`
Link employee to tender/project sites. Permission: `hr.employee.edit`

```json
{ "employeeId": "<id>", "assignedProject": ["<tenderId1>", "<tenderId2>"] }
```

---

## Utility Reads

| Endpoint | Description |
|---|---|
| `GET /employee/role/filter?role=<id>` | All employees with a specific role |
| `GET /employee/with-roles` | Employees who have a role assigned |
| `GET /employee/unassigned` | Employees with no role |
| `GET /employee/assigned` | Employees with role + project |

---

## Employee Model — Key Fields

| Field | Type | Notes |
|---|---|---|
| `employeeId` | String | Auto-generated `EMP-001` |
| `userType` | `Office` / `Site` | Drives attendance mode |
| `shiftType` | `General` / `Night` / `Morning` / `Flexible` | Used for late-entry calc |
| `accessMode` | `WEBSITE` / `MOBILE` / `BOTH` | Login channel restriction |
| `hrStatus` | `Probation` / `Confirmed` / `Notice Period` / `Relieved` | Employment stage |
| `reportsTo` | ObjectId → Employee | Manager for leave approvals |
| `leaveBalance` | `{ PL, CL, SL, compOff[] }` | Live balance, deducted on approval |
| `payroll.basicSalary` | Number | Used for payroll generation |

---

## Error Codes

| Status | Meaning |
|---|---|
| `401` | Missing / expired token |
| `403` | No permission for this action |
| `404` | Employee not found |
| `409` | Email already registered |
