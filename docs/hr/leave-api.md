# Leave Request API

Base path: `/leave`

All routes require JWT (`accessToken` cookie or `Authorization: Bearer <token>`).
`employeeId` and `actionBy` are always derived from the JWT — never send them in the request body.

---

## Leave Types

| Type | Balance Field | Default Entitlement | Notes |
|---|---|---|---|
| `CL` | `leaveBalance.CL` | 12 days | Casual Leave |
| `SL` | `leaveBalance.SL` | 12 days | Sick Leave |
| `PL` | `leaveBalance.PL` | 0 (accrues) | Privilege / Earned Leave |
| `Maternity` | `leaveBalance.Maternity` | 84 days | Per Maternity Benefit Act |
| `Paternity` | `leaveBalance.Paternity` | 15 days | Standard company policy |
| `Bereavement` | `leaveBalance.Bereavement` | 5 days | Immediate family only |
| `LWP` | — | — | No balance needed |
| `CompOff` | `leaveBalance.compOff[]` | Earned | FIFO deduction from comp-off credits |
| `Permission` | — | Max 3/month | Short leave (no day deduction) |

---

## Approval Flow

```
Employee applies → Pending
    ↓ Manager approves (role:"Manager")
Manager Approved
    ↓ HR approves (role:"HR")
HR Approved  ← final state
    ↓ (optional)
Rejected / Cancelled
```

---

## Endpoints

### POST `/leave/apply`
Apply for leave. `employeeId` from JWT.

**Request body:**
```json
{
  "leaveType": "CL",
  "requestType": "Full Day",
  "fromDate": "2026-04-20",
  "toDate": "2026-04-22",
  "reason": "Personal work",
  "coveringEmployeeId": "<optionalColleagueId>"
}
```

For **Short Leave (Permission)**:
```json
{
  "leaveType": "Permission",
  "requestType": "Short Leave",
  "fromDate": "2026-04-20",
  "toDate": "2026-04-20",
  "reason": "Doctor visit",
  "shortLeaveTime": { "from": "10:00", "to": "12:00" }
}
```

`requestType` enum: `Full Day` | `First Half` | `Second Half` | `Short Leave`

**Validations:**
- No pending leave already in queue (one at a time policy)
- No date overlap with existing approved leave
- Short Leave: max 3 per calendar month
- Non-LWP: must have sufficient balance
- Weekend / Holiday days are excluded from `totalDays`

**Response `201`:**
```json
{ "status": true, "message": "Leave applied successfully", "data": { "_id": "...", "status": "Pending", "totalDays": 2 } }
```

---

### GET `/leave/my-history`
View own leave history. Pass `?userId=<id>` if HR wants to view another employee's history.

**Query:** `?status=Pending` (optional filter)

---

### POST `/leave/cancel`
Cancel a leave request (employee or HR).

```json
{ "leaveRequestId": "<id>", "cancellationReason": "Plans changed" }
```

- If already approved (Manager or HR Approved): balance is refunded and "On Leave" attendance records cleared.

---

### GET `/leave/team-pending`
Manager views pending requests from their direct reports. Uses JWT to identify manager.

Pass `?managerId=<id>` if HR wants to view any specific manager's queue.

---

### POST `/leave/action`
Approve or Reject a leave. `actionBy` from JWT.

**Request body:**
```json
{
  "leaveRequestId": "<id>",
  "action": "Approve",
  "role": "Manager",
  "remarks": "Approved. Ensure handover."
}
```

| `role` | Can act on | Resulting status |
|---|---|---|
| `Manager` | `Pending` → | `Manager Approved` |
| `HR` | `Manager Approved` → | `HR Approved` |

To **reject**: `"action": "Reject"` — works from `Pending` or `Manager Approved`.

On approval:
- Balance deducted immediately
- Attendance records for the leave period auto-set to `On Leave`
- Employee receives notification

---

### GET `/leave/all-pending`
HR views all Pending + Manager-Approved leaves company-wide. Permission: `hr.leave.read`

**Query:** `?status=Pending&fromDate=2026-04-01&toDate=2026-04-30`

---

## Leave Balance Shape (on Employee model)

```json
"leaveBalance": {
  "CL": 10,
  "SL": 8,
  "PL": 0,
  "compOff": [
    {
      "earnedDate": "2026-01-26",
      "expiryDate": "2026-03-27",
      "isUsed": false,
      "reason": "Worked on Republic Day"
    }
  ]
}
```

---

## Error Codes

| Status | Scenario |
|---|---|
| `400` | Insufficient balance / validation failure |
| `409` | Date overlap with existing leave |
| `404` | Leave request or employee not found |
