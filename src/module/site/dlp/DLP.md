# DLP — Daily Labour Report Module

**Location:** `src/module/site/dlp/`
**Route prefix:** `/dlp`
**Model:** `DLRModel` → collection `DailyLabourReport`

---

## Schema

The schema has **two separate sub-arrays** inside one document:
- `work_entries` — *what* work was done (progress / quantities)
- `attendance_entries` — *who* worked and *how much* to pay

### DailyLabourReportSchema

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `report_date` | Date | Yes | Indexed |
| `project_id` | String | Yes | Indexed |
| `contractor_id` | String | Yes | Indexed |
| `work_entries` | [workEntrySchema] | — | Work progress entries |
| `attendance_entries` | [attendanceEntrySchema] | — | Attendance & wage entries |
| `grand_total_qty` | Number | — | Auto-calculated (sum of work quantities) |
| `grand_total_man_days` | Number | — | Auto-calculated from attendance |
| `grand_total_amount` | Number | — | Auto-calculated from attendance wages |
| `status` | String | — | `PENDING` \| `APPROVED` \| `REJECTED` (default: `PENDING`) |
| `remark` | String | — | Default: `"No Remark"` |
| `created_by` | String | — | |

### workEntrySchema (`_id: false`) — Work Progress

| Field | Type | Notes |
|-------|------|-------|
| `description` | String | Required — work description |
| `category` | String | Required — e.g. Brick Masonry, Backfilling |
| `l` | Number | Length dimension |
| `b` | Number | Breadth dimension |
| `h` | Number | Height dimension |
| `quantity` | Number | Auto = l×b×h if any dimension set |
| `unit` | String | Default: `CUM` |
| `remark` | String | Default: `"No Remark"` |

### attendanceEntrySchema (`_id: false`) — Attendance & Wages

| Field | Type | Notes |
|-------|------|-------|
| `worker_id` | String | Required — FK to ContractWorker |
| `worker_name` | String | Snapshot |
| `category` | String | Mason, Helper, Welder, etc. |
| `status` | String | `PRESENT` \| `ABSENT` \| `HALF_DAY` (default: `PRESENT`) |
| `daily_wage` | Number | Snapshotted from Contractor wage_fixing |
| `remark` | String | |

### Pre-save Middleware

**A. Work quantities** (from `work_entries`):
- If any of `l`, `b`, `h` are set → `quantity = l × b × h`
- Accumulated into `grand_total_qty`

**B. Man-days & Financials** (from `attendance_entries`):
- PRESENT: `grand_total_man_days` +1, amount += daily_wage
- HALF_DAY: `grand_total_man_days` +0.5, amount += daily_wage / 2
- ABSENT: no contribution

> Never set `grand_total_qty`, `grand_total_man_days`, or `grand_total_amount` manually — always auto-calculated.

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/dlp/api/create` | Create a single Daily Labour Report |
| `POST` | `/dlp/api/bulk-create` | Create multiple reports in one call |
| `GET` | `/dlp/api/list/:project_id` | All reports for a project (no sub-arrays) |
| `GET` | `/dlp/api/list/:project_id/:contractor_id` | Reports filtered by contractor |
| `GET` | `/dlp/api/summary/:project_id` | Date-wise summary with totals and project name |
| `GET` | `/dlp/api/report-date/:project_id/:report_date` | All reports for a project on a specific date |
| `GET` | `/dlp/api/details/:id` | Full report with both entry arrays |
| `PUT` | `/dlp/api/update/:id` | Update entries (PENDING only) |
| `PATCH` | `/dlp/api/status/:id` | Approve or Reject |
| `DELETE` | `/dlp/api/delete/:id` | Delete report (PENDING only) |

### Query Params (list endpoints)
| Param | Description |
|-------|-------------|
| `from` | Start date filter (ISO string) |
| `to` | End date filter (ISO string) |

---

## Request / Response Examples

### POST `/dlp/api/create`
```json
{
  "report_date": "2026-03-11",
  "project_id": "PRJ-001",
  "contractor_id": "CON-001",
  "created_by": "EMP-001",
  "remark": "Day 1 plastering work",
  "work_entries": [
    {
      "description": "Internal Plastering",
      "category": "Plastering",
      "l": 10, "b": 4, "h": 0,
      "unit": "SQM",
      "remark": "Ground floor walls"
    },
    {
      "description": "Backfilling",
      "category": "Earthwork",
      "quantity": 15,
      "unit": "CUM"
    }
  ],
  "attendance_entries": [
    {
      "worker_id": "CW-001",
      "worker_name": "Raju",
      "category": "Mason",
      "status": "PRESENT",
      "daily_wage": 650
    },
    {
      "worker_id": "CW-002",
      "worker_name": "Suresh",
      "category": "Helper",
      "status": "HALF_DAY",
      "daily_wage": 400
    },
    {
      "worker_id": "CW-003",
      "worker_name": "Mohan",
      "category": "Helper",
      "status": "ABSENT",
      "daily_wage": 400
    }
  ]
}
```

**Response `201`:**
```json
{
  "status": true,
  "message": "Report created",
  "data": {
    "_id": "...",
    "project_id": "PRJ-001",
    "contractor_id": "CON-001",
    "report_date": "2026-03-11T00:00:00.000Z",
    "grand_total_qty": 55,
    "grand_total_man_days": 1.5,
    "grand_total_amount": 850,
    "status": "PENDING",
    "work_entries": [...],
    "attendance_entries": [...]
  }
}
```

### POST `/dlp/api/bulk-create`

Accepts an array of reports **or** `{ "reports": [...] }`:
```json
[
  {
    "report_date": "2026-03-11",
    "project_id": "PRJ-001",
    "contractor_id": "CON-001",
    "work_entries": [...],
    "attendance_entries": [...]
  },
  {
    "report_date": "2026-03-11",
    "project_id": "PRJ-001",
    "contractor_id": "CON-002",
    "work_entries": [...],
    "attendance_entries": [...]
  }
]
```

> **Side effect:** automatically creates an NMR Attendance record for each report (skips if one already exists for that `project_id + contractor_id + date`).

### GET `/dlp/api/summary/:project_id`

Date-wise aggregated summary, sorted latest date first. Project name looked up from `tenders` collection via `project_id` → `tender_id`.

**Response `200`:**
```json
{
  "status": true,
  "count": 3,
  "data": [
    {
      "report_date": "2026-03-13",
      "project_id": "TND-001",
      "project_name": "Highway Construction Phase 1",
      "total_reports": 4,
      "total_man_days": 12.5,
      "total_amount": 8750
    }
  ]
}
```

---

### GET `/dlp/api/report-date/:project_id/:report_date`

Returns all reports for a project on a specific date. Uses a UTC day range (`00:00:00` → `23:59:59`) to match stored `Date` objects correctly.

**Params**
- `report_date` — ISO date string e.g. `2026-03-13`

**Response `200`:**
```json
{
  "status": true,
  "count": 2,
  "data": [ ...fullReports ]
}
```

---

### PUT `/dlp/api/update/:id`
```json
{
  "work_entries": [...],
  "attendance_entries": [...],
  "remark": "Updated after site check"
}
```

### PATCH `/dlp/api/status/:id`
```json
{ "status": "APPROVED", "remark": "Verified on site" }
```

---

## NMR Attendance Integration

During **bulk-create**, NMR attendance is auto-created from `attendance_entries`:

| DLP field | → NMR field |
|-----------|------------|
| `report_date` | `attendance_date` |
| `project_id` | `project_id` |
| `contractor_id` | `contractor_id` |
| `attendance_entries[].worker_id` | `attendance_list[].worker_id` |
| `attendance_entries[].worker_name` | `attendance_list[].worker_name` |
| `attendance_entries[].category` | `attendance_list[].category` |
| `attendance_entries[].status` | `attendance_list[].status` |
| `attendance_entries[].daily_wage` | `attendance_list[].daily_wage` |

`in_time` and `out_time` default to `""` and can be updated via the NMR attendance API.

---

## Business Rules

- Only `PENDING` reports can be **updated** or **deleted**.
- `APPROVED` / `REJECTED` reports are immutable.
- `work_entries` and `attendance_entries` are intentionally separate — a worker appears in `attendance_entries`, not in `work_entries`.
- All grand totals are auto-calculated by pre-save middleware — never set manually.
