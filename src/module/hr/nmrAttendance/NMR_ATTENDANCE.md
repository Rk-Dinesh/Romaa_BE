# NMR Attendance Module

**NMR** = Non-Muster Roll (contract workers not on regular payroll)

**Location:** `src/module/hr/nmrAttendance/`
**Route prefix:** `/nmrattendance`
**Model:** `NMRAttendanceModel` → collection `NMR_Attendance`

---

## Schema

### NMRSchema

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `attendance_date` | Date | Yes | Indexed |
| `project_id` | String | Yes | Indexed |
| `contractor_id` | String | Yes | Indexed |
| `attendance_list` | [worker sub-doc] | — | See below |
| `total_present` | Number | — | Auto-calculated in pre-save |
| `total_payable_amount` | Number | — | Auto-calculated in pre-save |
| `verified_by` | String | — | Supervisor / Manager ID |
| `status` | String | — | `SUBMITTED` \| `APPROVED` (default: `SUBMITTED`) |

### attendance_list sub-document

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `worker_id` | String | Yes | FK to ContractWorker |
| `worker_name` | String | — | Snapshot |
| `category` | String | — | Mason, Helper, Welder, etc. |
| `status` | String | — | `PRESENT` \| `ABSENT` \| `HALF_DAY` (default: `PRESENT`) |
| `in_time` | String | — | e.g. `"08:30"` |
| `out_time` | String | — | e.g. `"17:30"` |
| `daily_wage` | Number | — | Snapshotted from Contractor wage fixing |

### Pre-save Middleware
- PRESENT: `total_present` +1, amount += daily_wage
- HALF_DAY: `total_present` +0.5, amount += daily_wage / 2
- ABSENT: no contribution

---

## Data Source

NMR attendance can be created in two ways:

| Method | When to use |
|--------|-------------|
| Manual create (`POST /api/create`) | Direct entry by supervisor |
| Seed from DLP (`POST /api/create-from-dlp/:dlr_id`) | Auto-populate from a Daily Labour Report's `work_entries` |

When seeding from DLP, `work_entries[].worker_id/name/category/status/daily_wage` are mapped to `attendance_list`. `in_time` and `out_time` default to empty and can be updated afterwards.

Duplicate prevention: one NMR record per `project_id + contractor_id + attendance_date`.

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/nmrattendance/api/create` | Create attendance manually |
| `POST` | `/nmrattendance/api/create-from-dlp/:dlr_id` | Seed from a DLP report |
| `GET` | `/nmrattendance/api/list/:project_id` | All records for a project (no attendance_list) |
| `GET` | `/nmrattendance/api/details/:id` | Full record with attendance_list |
| `GET` | `/nmrattendance/api/worker/:project_id/:worker_id` | Worker attendance history |
| `GET` | `/nmrattendance/api/summary/:project_id` | Per-worker totals |
| `PUT` | `/nmrattendance/api/update/:id` | Edit attendance_list (SUBMITTED only) |
| `PATCH` | `/nmrattendance/api/approve/:id` | Approve record |

### Query Params (list / summary / worker endpoints)
| Param | Description |
|-------|-------------|
| `from` | Start date filter (ISO string) |
| `to` | End date filter (ISO string) |
| `contractor_id` | Filter by contractor (list, summary only) |

---

## Request / Response Examples

### POST `/nmrattendance/api/create`
```json
{
  "attendance_date": "2026-03-11",
  "project_id": "PRJ-001",
  "contractor_id": "CON-001",
  "verified_by": "EMP-010",
  "attendance_list": [
    {
      "worker_id": "CW-001",
      "worker_name": "Raju",
      "category": "Mason",
      "status": "PRESENT",
      "in_time": "08:00",
      "out_time": "17:00",
      "daily_wage": 650
    },
    {
      "worker_id": "CW-002",
      "worker_name": "Suresh",
      "category": "Helper",
      "status": "HALF_DAY",
      "in_time": "08:00",
      "out_time": "13:00",
      "daily_wage": 400
    }
  ]
}
```

**Response `201`:**
```json
{
  "status": true,
  "message": "NMR Attendance created",
  "data": {
    "_id": "...",
    "attendance_date": "2026-03-11T00:00:00.000Z",
    "project_id": "PRJ-001",
    "contractor_id": "CON-001",
    "total_present": 1.5,
    "total_payable_amount": 850,
    "status": "SUBMITTED",
    ...
  }
}
```

### POST `/nmrattendance/api/create-from-dlp/:dlr_id`
```json
{ "verified_by": "EMP-010" }
```

**Response `201`:**
```json
{
  "status": true,
  "message": "NMR Attendance created from DLP",
  "data": { ... }
}
```

### GET `/nmrattendance/api/summary/:project_id?from=2026-03-01&to=2026-03-31`
```json
{
  "status": true,
  "count": 3,
  "data": [
    {
      "worker_id": "CW-001",
      "worker_name": "Raju",
      "category": "Mason",
      "contractor_id": "CON-001",
      "present_days": 20,
      "half_days": 2,
      "absent_days": 3,
      "total_payable": 13650
    }
  ]
}
```

### PATCH `/nmrattendance/api/approve/:id`
```json
{ "verified_by": "EMP-010" }
```

### PUT `/nmrattendance/api/update/:id`
```json
{
  "verified_by": "EMP-010",
  "attendance_list": [ ... ]
}
```

---

## Business Rules

- Only `SUBMITTED` records can be **updated**.
- Once `APPROVED`, the record is immutable.
- `total_present` and `total_payable_amount` are always auto-calculated — never set manually.
- One record per `project_id + contractor_id + attendance_date` — duplicate creation from DLP will throw an error.
- `daily_wage` should be snapshotted at the time of entry — not dynamically fetched.
