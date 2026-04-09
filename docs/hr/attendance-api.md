# Attendance API

Base path: `/attendance`

Punch routes require JWT. Report routes require JWT + `hr.attendance.*` permission.

---

## Punch Flow

```
In → (BreakStart → BreakEnd)* → (LunchStart → LunchEnd) → Out
```

Rules:
- Max 2 breaks per day
- Max 1 lunch per day
- Cannot punch `In` twice
- Must end Break before Out
- After `Out`, day is closed — no further punches

---

## Endpoints

### POST `/attendance/photourl`
Upload a punch photo to S3 (call this first, then pass the URL to `/punch`).

**Form-data:** `file` — image (max 1 MB)

**Response:**
```json
{ "status": true, "fileUrl": "https://bucket.s3.region.amazonaws.com/..." }
```

---

### POST `/attendance/punch`
Record a punch event. Requires JWT.

**Request body:**
```json
{
  "punchType": "In",
  "latitude": 19.0760,
  "longitude": 72.8777,
  "siteLatitude": 19.0760,
  "siteLongitude": 72.8777,
  "address": "Site Gate, Mumbai",
  "photoUrl": "https://...",
  "attendanceType": "Site",
  "shiftType": "General",
  "deviceId": "device-abc",
  "deviceModel": "Samsung A52",
  "ipAddress": "192.168.1.10",
  "geofenceId": "<geofenceId>",
  "geofenceSiteId": "<tenderId>",
  "remarks": ""
}
```

`punchType` enum: `In` | `Out` | `BreakStart` | `BreakEnd` | `LunchStart` | `LunchEnd`

`attendanceType` enum: `Office` | `Remote` | `Site` | `Hybrid` | `On Duty` | `Work From Home`

**Geofence validation:** If `siteLatitude` + `siteLongitude` are provided, the server calculates Haversine distance. Rejects with 403 if > 1000m.

**Auto-calculations on each punch:**
- Sessions (Work / Break / Lunch intervals) updated
- `netWorkHours` recalculated
- On `Out`: final `status` determined (Present / Half-Day / Absent) based on hours worked and late-entry count

**Response `200`:**
```json
{
  "success": true,
  "data": { "punchType": "Out", "netWorkHours": 8.5, "status": "Present" }
}
```

---

### GET `/attendance/get-attendance-by-date-and-employee-id`
Quick status check for a date. Requires JWT.

**Query:** `?date=2026-04-09&employeeId=<id>`

**Response:**
```json
{ "date": "2026-04-09", "status": "Present", "punchType": "Out" }
```

---

### GET `/attendance/get-my-attendance-stats`
Monthly calendar view for self (or any employee if HR passes `?userId=`). Requires JWT.

**Query:** `?month=4&year=2026&userId=<optionalId>`

**Response:**
```json
{
  "calendarData": [
    { "date": "2026-04-01", "status": "Present", "hours": 8.5, "inTime": "09:05", "outTime": "18:15", "isLate": false }
  ],
  "summary": {
    "present": 18, "absent": 2, "halfDay": 1, "late": 3,
    "permissions": 1, "regularized": 0, "holidays": 5
  }
}
```

---

### POST `/attendance/apply-regularization`
Employee requests a correction on a past record. Requires JWT. `employeeId` from JWT.

```json
{
  "date": "2026-04-05",
  "category": "Missed Punch",
  "reason": "My phone died at checkout",
  "correctedInTime": "09:00",
  "correctedOutTime": "18:00"
}
```

`category` enum: `Late Entry` | `Missed Punch` | `Work on Leave` | `System Glitch` | `Work From Home`

---

### POST `/attendance/action-regularization`
HR / Manager approves or rejects. Requires JWT + `hr.attendance.edit`

```json
{
  "employeeId": "<id>",
  "date": "2026-04-05",
  "action": "Approved",
  "managerRemarks": "Verified with site supervisor"
}
```

`action`: `Approved` | `Rejected`

**On Approved:**
- `Late Entry` → clears late flag, removes penalty
- `Work on Leave` → marks Present, refunds leave balance, removes leave request
- `Missed Punch` → marks Present with 9h netWorkHours

---

### GET `/attendance/get-daily-report`
All-employee snapshot for a date. Requires JWT + `hr.attendance.read`

**Query:** `?date=2026-04-09`

**Response array:**
```json
[{ "id": "EMP-001", "name": "John", "dept": "Civil", "inTime": "09:05 AM", "status": "Present", "late": "No" }]
```

---

### GET `/attendance/get-monthly-report`
Aggregated monthly report (all employees). Requires JWT + `hr.attendance.read`

**Query:** `?month=4&year=2026`

---

## Status Values

| Status | Meaning |
|---|---|
| `Present` | Worked ≥ 7 effective hours |
| `Half-Day` | Worked 4–7 hours OR 4th+ late entry |
| `Absent` | < 4 hours OR late entry (1st–3rd occurrence) |
| `On Leave` | Pre-filled by approved leave |
| `Holiday` | Punched in on a holiday |
| `Missed Punch` | Punched in but never out |

---

## Late Entry Rules

| Occurrence | Consequence |
|---|---|
| 1st–3rd | Marked `Absent`, regularization required |
| 4th+ | Marked `Half-Day`, 0.5 day deducted |

---

## Comp-Off Auto-Award (Holiday Work)

| Hours Worked | Award |
|---|---|
| ≥ 8 hrs | 1 Comp-Off credit |
| 4–7.99 hrs | 0.5 Comp-Off credit |
| < 4 hrs | No award |

Comp-Off credits are added to `employee.leaveBalance.compOff[]` with a 60-day expiry.
