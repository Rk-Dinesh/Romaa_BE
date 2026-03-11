# DLP — Daily Labour Report Module

**Location:** `src/module/site/dlp/`
**Route prefix:** `/dlp`
**Model:** `DLRModel` → collection `DailyLabourReport`

---

## Schema

### DailyLabourReportSchema

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `report_date` | Date | Yes | Indexed |
| `project_id` | String | Yes | Indexed |
| `contractor_id` | String | Yes | Indexed |
| `work_entries` | [workEntrySchema] | — | See below |
| `grand_total_headcount` | Number | — | Auto-calculated in pre-save |
| `grand_total_amount` | Number | — | Auto-calculated in pre-save |
| `status` | String | — | `PENDING` \| `APPROVED` \| `REJECTED` (default: `PENDING`) |
| `remark` | String | — | |
| `created_by` | String | — | |

### workEntrySchema (`_id: false`)

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `description` | String | Yes | Work description |
| `category` | String | Yes | e.g. Mason, Helper |
| `l` | Number | — | Length dimension |
| `b` | Number | — | Breadth dimension |
| `h` | Number | — | Height dimension |
| `quantity` | Number | — | Auto = l×b×h if any dimension set |
| `unit` | String | — | Default: `CUM` |
| `worker_id` | String | Yes | FK to ContractWorker |
| `worker_name` | String | — | |
| `status` | String | — | `PRESENT` \| `ABSENT` \| `HALF_DAY` (default: `PRESENT`) |
| `daily_wage` | Number | — | |
| `remark` | String | — | |

### Pre-save Middleware
- If `l`, `b`, or `h` are set → `quantity = l × b × h`
- PRESENT: headcount +1, amount += daily_wage
- HALF_DAY: headcount +0.5, amount += daily_wage / 2
- ABSENT: no contribution

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/dlp/api/create` | Create a Daily Labour Report |
| `GET` | `/dlp/api/list/:project_id` | All reports for a project |
| `GET` | `/dlp/api/list/:project_id/:contractor_id` | Reports filtered by contractor |
| `GET` | `/dlp/api/details/:id` | Full report with work entries |
| `PUT` | `/dlp/api/update/:id` | Update work entries (PENDING only) |
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
  "remark": "Day 1 work",
  "work_entries": [
    {
      "description": "Brick Masonry",
      "category": "Mason",
      "l": 5, "b": 3, "h": 0,
      "unit": "SQM",
      "worker_id": "CW-001",
      "worker_name": "Raju",
      "status": "PRESENT",
      "daily_wage": 650
    },
    {
      "description": "Backfilling",
      "category": "Helper",
      "quantity": 10,
      "unit": "CUM",
      "worker_id": "CW-002",
      "worker_name": "Suresh",
      "status": "HALF_DAY",
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
    "grand_total_headcount": 1.5,
    "grand_total_amount": 850,
    "status": "PENDING",
    ...
  }
}
```

### PATCH `/dlp/api/status/:id`
```json
{ "status": "APPROVED", "remark": "Verified on site" }
```

### PUT `/dlp/api/update/:id`
```json
{
  "work_entries": [ ... ],
  "remark": "Updated after review"
}
```

---

## Business Rules

- Only `PENDING` reports can be **updated** or **deleted**.
- `APPROVED` / `REJECTED` reports are immutable.
- `grand_total_headcount` and `grand_total_amount` are always auto-calculated — never set manually.
- NMR Attendance can be seeded from a DLP report via `POST /nmrattendance/api/create-from-dlp/:dlr_id`.
