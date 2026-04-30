# User Attendance

Base path: `/attendance` — multi-punch capture (in/out + breaks/lunch), geofence + photo + mock-GPS verification, regularization workflow, and HR analytical reports (daily, monthly, late, absentee, overtime, dashboard summary).

See [README.md](README.md) for shared conventions.

---

## 1. Data model — what a frontend needs to know

```jsonc
// One document per (employeeId, date) — date is UTC midnight
{
  employeeId,
  date,                    // UTC midnight
  istDate,                 // wall-clock IST for display

  shiftConfig: {
    shiftType: "Fixed"|"Rotational"|"Flexible",
    startTime: "09:00", endTime: "18:00",
    istStartTime, istEndTime,
    gracePeriodMins: 15,
    breakDurationMins: 60,
    isNightShift: false
  },

  timeline: [             // every punch event in order
    {
      punchType: "In"|"Out"|"BreakStart"|"BreakEnd"|"LunchStart"|"LunchEnd",
      timestamp, istTimestamp,
      location: { lat, lng, address, accuracy, isMock },
      device: { deviceId, model, os, ip },
      verification: { method:"Geofence"|"Face"|"Biometric"|"Manual", confidenceScore, photoUrl },
      geofenceSiteId, geofenceId,
      remarks
    }
  ],

  sessions: [             // computed work/break/lunch intervals
    { startTime, endTime, durationMins, type:"Work"|"Break"|"Lunch", isBillable, isAutoClosed }
  ],

  firstIn, lastOut,
  totalDuration, totalBreakTime, permissionDurationMins, netWorkHours, overtimeHours,
  workType: "Regular"|"Overtime"|"Holiday Work",

  status: "Present"|"Absent"|"Half-Day"|"On Leave"|"Missed Punch"|"Holiday",
  attendanceType: "Office"|"Remote"|"Site"|"Hybrid"|"On Duty"|"Work From Home",

  flags: { isLateEntry, isEarlyExit, isAutoCheckOut, hasDispute, isPermission },

  regularization: {
    isApplied, status: "Pending"|"Approved"|"Rejected",
    reasonCategory: "Missed Punch"|"System Glitch"|"Work From Home"|"Client Visit"|"on leave"|"Late Entry"|"Work on Leave",
    userReason, managerReason,
    proposedInTime, proposedOutTime,    // HH:mm strings (Missed Punch)
    originalData (snapshot),
    correctedBy, correctedAt
  },

  payroll: {
    isLocked, batchId, processedAt,
    penalty: { isApplied, type:"Late Deduction"|"Half-Day Absent"|"No Pay", deductionAmount }
  },
  rewards: { isCompOffEligible, compOffCredit, expiryDate, approvalStatus:"Auto-Approved"|"Pending"|"Rejected" },
  sentiment: { score (1-5), tags: [String], capturedAt },
  remarks
}
```

The `timeline` is the source of truth — every other field is computed from it on each punch.

---

## 2. Endpoint catalog

### Employee actions

| Method | Path | Use |
|---|---|---|
| POST | `/attendance/photourl` | (public) upload punch photo, returns S3 URL |
| POST | `/attendance/punch` | submit a punch (In / Out / BreakStart / etc.) |
| POST | `/attendance/apply-regularization` | request correction |
| GET | `/attendance/get-my-attendance-stats?month=&year=&userId=` | calendar + summary for a month |
| GET | `/attendance/get-attendance-by-date-and-employee-id?date=&employeeId=` | single-day status |

### HR actions (`hr.attendance.*`)

| Method | Path | Permission |
|---|---|---|
| POST | `/attendance/action-regularization` | `edit` |
| GET | `/attendance/get-daily-report` | `read` |
| GET | `/attendance/get-monthly-report` | `read` |
| GET | `/attendance/regularization-list` | `read` |
| GET | `/attendance/regularization/:id` | `read` |
| GET | `/attendance/today-summary` | `read` |
| GET | `/attendance/late-report` | `read` |
| GET | `/attendance/absentee-report` | `read` |
| GET | `/attendance/overtime-report` | `read` |

---

## 3. Detailed specs

### POST `/attendance/photourl`

```
Content-Type: multipart/form-data
field: file (image, ≤ 1 MB)
```

```jsonc
// 200
{ "status": true, "message": "File uploaded successfully", "fileUrl": "https://...s3.../punch-XXXX.jpg" }
// 400 — no file or > 1 MB
```

UI: capture the photo first (camera input), POST to this endpoint, get back `fileUrl`, then send the punch with that URL embedded.

### POST `/attendance/punch`

```jsonc
// Request — most fields optional; at minimum employeeId + punchType + lat/lng (when geofencing)
{
  "employeeId": "<Employee _id>",
  "punchType": "In" | "Out" | "BreakStart" | "BreakEnd" | "LunchStart" | "LunchEnd",
  "latitude": 13.0827, "longitude": 80.2707, "accuracy": 12.5,
  "siteLatitude": 13.0820, "siteLongitude": 80.2710,   // for geofence distance
  "address": "Romaa Tower, Anna Salai",
  "photoUrl": "<from /photourl>",
  "isMock": false,                  // Android mock-GPS flag — true rejects the punch
  "confidenceScore": 92,            // optional face-match %
  "attendanceType": "Office" | "Site" | "Remote" | "Work From Home" | "On Duty" | "Hybrid",
  "shiftType": "General" | "Night" | "Morning" | "Flexible",
  "deviceId": "<UUID>", "deviceModel": "Pixel 8", "deviceOS": "Android 14",
  "ipAddress": "...",
  "geofenceId": "<Geofence _id>",
  "geofenceSiteId": "<Tender _id>",
  "remarks": "Late due to traffic"
}

// 200
{ "success": true, "message": "Check-In Successful",
  "data": { "punchType": "In", "time", "istTime", "netWorkHours", "status" } }

// 400 — state-machine violation ("already checked in", "must end Lunch first", "max 2 breaks", ...)
// 403 — Mock GPS detected (B11) OR location > 1000 m from site
```

State machine the backend enforces:

```
       In ─→ Working state ─→ (LunchStart → LunchEnd) (max 1)
                          ─→ (BreakStart → BreakEnd) (max 2)
                          ─→ Out (terminal)
```

UI:
- **Single live screen** with one big primary button that changes label based on the next valid action: "Check In" → "Start Lunch" / "Take Break" / "Check Out". Map `lastPunchType` from `/attendance/get-attendance-by-date-and-employee-id` to drive this.
- Before pressing, capture: photo (mandatory) + GPS lat/lng + accuracy + (Android) mock-GPS flag.
- Show distance-from-site live ("You are 42 m from the office — within range"). Block the button when > 1000 m.
- Show the running `netWorkHours` ticker after the first In.
- Sub-actions row: "Lunch", "Break", "End Lunch", "End Break" — only the legal ones enabled.

### POST `/attendance/apply-regularization`

```jsonc
{
  "date": "2026-04-15",                     // UTC midnight
  "category": "Missed Punch" | "Late Entry" | "Work on Leave" | "System Glitch" | "Work From Home" | "Client Visit",
  "reason": "...",
  "correctedInTime":  "09:30",              // HH:mm — for Missed Punch
  "correctedOutTime": "18:15"               // HH:mm — for Missed Punch
}
```

The `proposedInTime` / `proposedOutTime` are persisted on the regularization sub-doc and applied verbatim to `firstIn` / `lastOut` when HR approves (B3 fix). For other categories, the "corrected" times are ignored — the category itself implies the correction.

UI:
- Calendar cell tap → context menu "Apply regularization".
- Modal with category dropdown, reason textarea, conditional in/out time pickers when category=Missed Punch.
- After submit, the calendar cell badges with a small clock icon "Pending HR".

### POST `/attendance/action-regularization` (HR)

```jsonc
{
  "employeeId": "<Employee _id>",
  "date": "2026-04-15",
  "action": "Approved" | "Rejected",
  "managerRemarks": "..."
}
```

Approval effects depend on category:
- **Late Entry** → flips `isLateEntry=false`, clears `payroll.penalty`, status → Present.
- **Missed Punch** → applies `proposedInTime` / `proposedOutTime` to `firstIn` / `lastOut`, recomputes `netWorkHours`, appends a synthetic timeline row.
- **Work on Leave** → refunds 1 (or 0.5) day to the leave's balance type, shrinks the parent leave's window or marks it Cancelled if single-day (B4 fix). Never deletes the parent leave.

UI:
- Regularization list → row tap opens a side drawer with: original snapshot, proposed change, employee context, "Approve" / "Reject" buttons. On Reject, require a `managerRemarks` value.

### GET `/attendance/get-my-attendance-stats?month=4&year=2026[&userId=<id>]`

Returns the full month for one employee.

```jsonc
{
  "calendarData": [
    { "date": "2026-04-01", "status": "Present", "hours": 8.2, "inTime": "09:05", "outTime": "18:00",
      "isLate": false, "isHalfDay": false, "regularizationStatus": "None", "isRegularized": false, "permissionUsed": null },
    ...
  ],
  "summary": { "present": 21, "absent": 1, "halfDay": 1, "late": 3, "permissions": 2, "regularized": 1, "holidays": 4 }
}
```

UI:
- **Monthly calendar** with color-coded cells (use the README §Status pill colors).
- Cell badges: clock icon for late, half-circle icon for half-day, "R" badge for regularized.
- Below: summary tiles — Present / Absent / Late / Half-Day / Permissions / Holidays.
- Cell click → detail modal showing the day's timeline + regularization shortcut.

### GET `/attendance/get-attendance-by-date-and-employee-id?date=2026-04-15&employeeId=<id>`

Light response used to drive the punch UI's button state:

```jsonc
{ "date": "2026-04-15", "status": "Present", "punchType": "In" }
// or { "date": "...", "status": "No attendance recorded yet for this date", "punchType": null }
```

### GET `/attendance/get-daily-report` (HR)

```
?fromdate=&todate=  | ?date=
&page=&limit=&search=
```

Paginated; defaults today.

```jsonc
{
  "status": true, "currentPage": 1, "totalPages": 5, "totalCount": 87,
  "data": [
    { "id": "EMP-042", "name", "dept", "inTime", "outTime", "status",
      "late": "Yes"|"No", "permission", "location", "date" },
    ...
  ]
}
```

UI: HR Daily Attendance page — sortable data table with date filter, employee search, export-to-Excel button (frontend-side render).

### GET `/attendance/get-monthly-report` (HR)

```
?month=&year= | ?fromdate=&todate=
&page=&limit=&search=
```

Aggregates per-employee per-month — present, absent, half-day, late, leaves, permissions, plus a per-day log per employee.

```jsonc
{ "data": [
    { "_id": "<Employee _id>", "employeeName", "employeeCode", "department",
      "totalPresent", "totalAbsent", "totalHalfDay", "totalLate", "totalLeaves", "totalPermissions",
      "attendanceLog": [{ "date":"2026-04-01", "status", "inTime", "outTime", "isLate", "isRegularized" }, ...] },
    ...
  ], ...
}
```

UI: HR Monthly Attendance — expandable rows showing the per-day log. Bulk export button.

### GET `/attendance/regularization-list` (HR)

```
?fromdate=&todate=&page=&limit=&search=&status=Pending|Approved|Rejected
```

Returns paginated regularization requests with employee populated.

UI: HR Inbox-style list. Filter pills for status. Bulk-action toolbar. Click → detail drawer.

### GET `/attendance/regularization/:id` (HR)

Full document drilldown including the original-data snapshot.

UI: drives the side drawer / modal opened from the list.

### GET `/attendance/today-summary` (HR)

```jsonc
{
  "status": true,
  "data": {
    "headcount": 87,
    "present": 65, "halfDay": 2, "onLeave": 8, "absent": 5, "holiday": 0,
    "late": 7, "onPermission": 3,
    "notPunchedYet": 7,
    "pendingLeaves": 12, "pendingRegularizations": 3
  }
}
```

UI: HR Dashboard — 9 tiles in a responsive grid. Tap any tile → drill into the corresponding list filtered to today.

### GET `/attendance/late-report?fromdate=&todate=&page=&limit=&search=` (HR)

Per-employee late-count leaderboard for the date range.

```jsonc
{ "data": [
    { "_id":"<Emp _id>", "employeeId":"EMP-042", "name", "department", "designation", "lateCount": 5, "days": [Date, ...] },
    ...
  ], ...
}
```

UI: leaderboard sorted by `lateCount` desc. Each row expands to show the actual late dates.

### GET `/attendance/absentee-report?...` (HR)

Same shape but `absentCount`.

### GET `/attendance/overtime-report?...` (HR)

```jsonc
{ "data": [{ "_id", "employeeId", "name", "department", "totalOvertimeHours": 18.5, "days": 4 }, ...] }
```

UI: separate tab in the Reports page. Numeric column right-aligned with a bar visualization. Useful when payroll variable-pay is OT-driven.

---

## 4. UI design ideas

### Mobile punch screen (Employee)

Recommended layout:

```
┌───────────────────────────────────────┐
│  Romaa Attendance                     │
├───────────────────────────────────────┤
│  [ live map: pin = me, circle = site ]│
│  42 m from Romaa Tower — within range │
├───────────────────────────────────────┤
│      [    📷  Take Photo    ]         │
│   (preview thumbnail after capture)   │
├───────────────────────────────────────┤
│        ╭─────────────────╮            │
│        │   CHECK IN      │   ←  big   │
│        ╰─────────────────╯            │
│   Last action: not punched today      │
├───────────────────────────────────────┤
│   [Lunch]  [Break]  [End Lunch] ...   │  ← only legal ones enabled
├───────────────────────────────────────┤
│   Today so far                         │
│   In  09:05    Net  6h 12m             │
└───────────────────────────────────────┘
```

State variants:
- Pre-In → only "Check In" enabled.
- After In → "Check Out", "Lunch", "Break" enabled. "End Lunch/Break" disabled.
- During Lunch → only "End Lunch" enabled.
- After Out → all disabled, status "Day complete".

Reject scenarios surface as a banner with the server message:
- "Mock GPS detected. Punch rejected." → red banner.
- "Location mismatch. 1.2 km away." → red banner.
- "Limit Exceeded: Max 2 breaks." → orange banner.

### Web Calendar (Employee + Manager)

Reuse the same component for both roles. Manager view passes `?userId=<other employee>` via the existing endpoint. Manager can also drill into the day's full timeline.

### HR Dashboard

```
[Headcount 87] [Present 65] [On Leave 8] [Absent 5]
[Late 7]      [Half-Day 2] [Permission 3] [Holiday 0]
[Not punched yet 7] [Pending Leaves 12] [Pending Regularizations 3]
```

Each tile is a button. Wire to filtered routes:
- Late → `/attendance/late-report?fromdate=today&todate=today`
- On Leave → `/leave/all-pending?status=HR%20Approved&fromDate=today` (sort of — actually fetches active leaves for today, derive client-side)
- Pending Regularizations → `/attendance/regularization-list?status=Pending`

### HR Reports page

Tab strip: Daily | Monthly | Late | Absentee | Overtime | Regularization.
Each tab uses the same shared data-table component; only the columns and the source endpoint change.

---

## 5. Integration notes / gotchas

- `date` for an attendance record is **UTC midnight**. When the user's timezone is IST (+5:30), a "today" punch from 00:30–05:30 IST would land on the previous UTC date — backend normalises this on the fly using `today` server-side. Frontend should send dates as `YYYY-MM-DD` and let the backend handle UTC.
- The unique index `{employeeId, date}` means there's exactly one document per day per person. A second In on the same day is rejected with "You are already checked in."
- After the daily 23:59 cron runs, `status` may flip from "Missed Punch" to "Present"/"Half-Day"/"Absent" automatically. Don't cache attendance rows past midnight without re-fetching.
- Photo uploads have a hard 1 MB cap. For mobile, compress to JPEG ~70% quality before upload.
- `accuracy` and `confidenceScore` are useful for fraud-detection later — store and surface them in the regularization drilldown.
- `attendance.regularization.proposedInTime/proposedOutTime` are HH:mm strings; the backend builds the actual timestamps on the date field when approving.

---

## 6. Cross-references

- Day classification (working/non-working) → see [holidays-api.md](holidays-api.md) and [weekly-off-policy.md](weekly-off-policy.md).
- Holiday Work → CompOff credit → see [leave-api.md](leave-api.md) §CompOff.
- Manager team queue today → see [employee-api.md](employee-api.md) §`/me/team`.
- Daily absenteeism cron → see [README.md](README.md) §Cron schedule.
