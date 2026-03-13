# Work Done Module

Manages daily site work done reports linked to tenders and work orders.

---

## Base URL

```
/workdone
```

---

## Endpoints

### 1. Create Work Done (Single)

**POST** `/workdone/api/create`

Creates a single daily work done report.

**Request Body**
```json
{
  "tender_id": "TND-001",
  "work_order_id": "WOR-001",
  "report_date": "2026-03-13",
  "created_by": "Admin",
  "dailyWorkDone": [
    {
      "item_description": "Cement Plastering",
      "quantity": 20,
      "unit": "Sqm",
      "remarks": "Ground floor",
      "contractor_details": "NMR",
      "dimensions": {
        "length": 10,
        "breadth": 2,
        "height": 0
      }
    }
  ]
}
```

**Response** `201`
```json
{
  "success": true,
  "data": { ...workDoneDocument }
}
```

---

### 2. Bulk Create Work Done

**POST** `/workdone/api/bulk-create`

Creates multiple work done reports in a single request. Validates all work orders and quantities before inserting.

**Request Body** — array of payloads
```json
[
  {
    "tender_id": "TND-001",
    "work_order_id": "WOR-001",
    "report_date": "2026-03-13",
    "created_by": "Admin",
    "dailyWorkDone": [
      {
        "item_description": "Cement Plastering",
        "quantity": 20,
        "unit": "Sqm",
        "contractor_details": "NMR"
      }
    ]
  },
  {
    "tender_id": "TND-001",
    "work_order_id": "WOR-002",
    "report_date": "2026-03-13",
    "created_by": "Admin",
    "dailyWorkDone": [
      {
        "item_description": "Steel Fixing",
        "quantity": 5,
        "unit": "MT"
      }
    ]
  }
]
```

**Response** `201`
```json
{
  "success": true,
  "count": 2,
  "data": [ ...insertedDocuments ]
}
```

**Notes**
- All work orders are validated before any mutations occur.
- Quantity is deducted from `materialsRequired` on the work order if a matching `materialName` is found.
- Fails with `400` if body is not an array.

---

### 3. List All Work Done by Tender

**GET** `/workdone/api/list/:tender_id`

Returns all work done reports for a tender (excludes `dailyWorkDone` line items), sorted by `workDoneId` descending.

**Response** `200`
```json
{
  "success": true,
  "count": 10,
  "data": [ ...reports ]
}
```

---

### 4. Summary by Date

**GET** `/workdone/api/summary/:tender_id`

Returns a date-wise summary of how many work orders were submitted per day for a tender, sorted latest date first.

**Response** `200`
```json
{
  "success": true,
  "count": 3,
  "data": [
    { "report_date": "2026-03-13", "tender_id": "TND-001", "total_work_orders": 5 },
    { "report_date": "2026-03-12", "tender_id": "TND-001", "total_work_orders": 2 },
    { "report_date": "2026-03-10", "tender_id": "TND-001", "total_work_orders": 8 }
  ]
}
```

---

### 5. Get Specific Work Done Report

**GET** `/workdone/api/details/:tender_id/:workDoneId`

Returns a specific work done report including all `dailyWorkDone` line items.

**Response** `200`
```json
{
  "success": true,
  "data": { ...workDoneDocument }
}
```

---

### 6. Get Work Done by Report Date

**GET** `/workdone/api/report-date/:tender_id/:report_date`

Returns a work done report matching a specific date for a tender.

**Params**
- `report_date` — ISO date string e.g. `2026-03-13`

**Response** `200`
```json
{
  "success": true,
  "data": { ...workDoneDocument }
}
```

---

## Data Model

### WorkDone

| Field          | Type     | Description                                      |
|----------------|----------|--------------------------------------------------|
| `workDoneId`   | String   | Auto-generated ID (e.g. `WD-001`)               |
| `tender_id`    | String   | Linked tender                                    |
| `workOrder_id` | String   | Linked work order                                |
| `report_date`  | Date     | Date of the report                               |
| `status`       | String   | `Draft`, `Submitted`, `Approved`, `Rejected`     |
| `dailyWorkDone`| Array    | Line items (see below)                           |
| `totalWorkDone`| Number   | Count of line items                              |
| `created_by`   | String   | Creator name/ID                                  |

### WorkItem (dailyWorkDone line item)

| Field                | Type   | Description                        |
|----------------------|--------|------------------------------------|
| `item_description`   | String | Name of the work item              |
| `quantity`           | Number | Quantity completed                 |
| `unit`               | String | Unit (default: `Nos`)              |
| `dimensions.length`  | Number | Length                             |
| `dimensions.breadth` | Number | Breadth                            |
| `dimensions.height`  | Number | Height                             |
| `remarks`            | String | Optional notes                     |
| `contractor_details` | String | Contractor name (default: `NMR`)   |
