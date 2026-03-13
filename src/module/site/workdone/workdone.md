# WorkDone — Site Work Done Report Module

**Location:** `src/module/site/workdone/`
**Route prefix:** `/workdone`
**Model:** `WorkDoneModel` → collection `WorkDone`

---

## Schema

One document = one daily work done report for a tender. Contains an array of work line items.

### WorkDoneSchema

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `workId` | String | Yes | Auto-generated — `WKD-001`, `WKD-002`, … |
| `tender_id` | String | Yes | Indexed — links report to tender |
| `report_date` | Date | Yes | Default: now |
| `dailyWorkDone` | [WorkItemSchema] | — | Array of work line items |
| `totalWorkDone` | Number | — | Auto-calculated — sum of all item quantities |
| `created_by` | String | — | Default: `"Site Engineer"` |
| `status` | String | — | `Draft` \| `Submitted` \| `Approved` \| `Rejected` (default: `Submitted`) |

### WorkItemSchema (`_id: true`)

| Field | Type | Notes |
|-------|------|-------|
| `item_description` | String | Required — description of work done |
| `dimensions.length` | Number | Default: 0 |
| `dimensions.breadth` | Number | Default: 0 |
| `dimensions.height` | Number | Default: 0 |
| `quantity` | Number | Required — measured quantity |
| `unit` | String | Required — default: `Nos` |
| `remarks` | String | Default: `"No Remarks"` |
| `contractor_details` | String | Default: `"NMR"` |

> `WorkItemSchema` uses `_id: true` so individual rows can be edited or deleted by their ID.

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/workdone/api/create` | Create a new work done report |
| `GET` | `/workdone/api/list/:tender_id` | All reports for a tender (no `dailyWorkDone`) |
| `GET` | `/workdone/api/report-date/:tender_id/:report_date` | Reports for a tender on a specific date |
| `GET` | `/workdone/api/details/:id` | Full report with all work items |
| `PUT` | `/workdone/api/update/:id` | Update work items (blocked if Approved) |
| `PATCH` | `/workdone/api/status/:id` | Change status |
| `DELETE` | `/workdone/api/delete/:id` | Delete report (blocked if Approved) |

### Query Params (list endpoint)
| Param | Description |
|-------|-------------|
| `from` | Start date filter (ISO string) |
| `to` | End date filter (ISO string) |

---

## Request / Response Examples

### POST `/workdone/api/create`
```json
{
  "tender_id": "TND-001",
  "report_date": "2026-03-13",
  "created_by": "EMP-001",
  "dailyWorkDone": [
    {
      "item_description": "Brick Masonry - Ground Floor",
      "dimensions": { "length": 10, "breadth": 0.23, "height": 3 },
      "quantity": 6.9,
      "unit": "CUM",
      "remarks": "North wall completed",
      "contractor_details": "CON-001"
    },
    {
      "item_description": "Plastering - Internal",
      "quantity": 45,
      "unit": "SQM",
      "contractor_details": "NMR"
    }
  ]
}
```

**Response `201`:**
```json
{
  "status": true,
  "message": "Work done report created",
  "data": {
    "_id": "...",
    "workId": "WKD-001",
    "tender_id": "TND-001",
    "report_date": "2026-03-13T00:00:00.000Z",
    "totalWorkDone": 51.9,
    "status": "Submitted",
    "dailyWorkDone": [...]
  }
}
```

---

### GET `/workdone/api/list/:tender_id?from=2026-03-01&to=2026-03-13`

Returns list view — `dailyWorkDone` array excluded, sorted latest first.

**Response `200`:**
```json
{
  "status": true,
  "count": 5,
  "data": [
    {
      "workId": "WKD-005",
      "tender_id": "TND-001",
      "report_date": "2026-03-13T00:00:00.000Z",
      "totalWorkDone": 51.9,
      "status": "Submitted",
      "created_by": "EMP-001"
    }
  ]
}
```

---

### PUT `/workdone/api/update/:id`
```json
{
  "dailyWorkDone": [
    {
      "item_description": "Brick Masonry - Ground Floor",
      "quantity": 8,
      "unit": "CUM",
      "remarks": "Revised after measurement"
    }
  ]
}
```

> `totalWorkDone` is recalculated automatically on update.

### PATCH `/workdone/api/status/:id`
```json
{ "status": "Approved" }
```

---

## Business Rules

- `workId` is auto-generated via `IdcodeServices` using prefix `WKD` — never set manually.
- `totalWorkDone` is auto-calculated as the sum of all `dailyWorkDone[].quantity` — never set manually.
- **Approved** reports cannot be **updated** or **deleted**.
- `status` values: `Draft` → `Submitted` → `Approved` or `Rejected`.
