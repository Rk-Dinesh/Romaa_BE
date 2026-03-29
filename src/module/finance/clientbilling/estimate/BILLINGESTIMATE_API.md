# Billing Estimate Module

Stores detailed **measurement book (MB) data** linked to a client bill. One document per `{ tender_id, bill_id }` — items are replaced on re-upload.

---

## Workflow

1. Upload a Client Bill (`POST /clientbilling/upload-csv`)
2. Upload the billing estimate CSV for that bill (`POST /billing/estimate/upload-csv`)
3. Fetch full estimate detail (`GET /billing/estimate/details?tender_id=&bill_id=`)

---

## API Reference

Base prefix: `/billing/estimate`

---

### POST `/upload-csv`

Upload a CSV to create or replace the billing estimate for a bill.

**Request:** `multipart/form-data`

| Field | Required | Description |
|---|---|---|
| `file` | Yes | CSV or XLSX file |
| `tender_id` | Yes | e.g. `TND-001` |
| `bill_id` | Yes | e.g. `CB/25-26/0001` |
| `created_by_user` | No | Employee ID |

**Response `200`:**
```json
{
  "status": true,
  "message": "Successfully processed bill CB/25-26/0001. Items: 12",
  "data": { /* billing estimate document */ }
}
```

---

### GET `/details?tender_id=TND-001&bill_id=CB/25-26/0001`

Returns the full estimate document with all items and measurement details.

**Response `200`:**
```json
{
  "status": true,
  "data": {
    "_id": "...",
    "tender_id": "TND-001",
    "bill_id": "CB/25-26/0001",
    "items": [
      {
        "item_code": "ID001",
        "item_name": "Earth Work Excavation",
        "unit": "Cum",
        "day": "",
        "quantity": 113.4,
        "mb_book_ref": "MB-12",
        "details": [
          {
            "description": "Foundation Trench",
            "nos": "",
            "length": 0, "breadth": 0, "depth": 0,
            "quantity": 0,
            "details": [
              {
                "description": "Grid A-B",
                "nos": "2X3",
                "length": 10.5, "breadth": 1.2, "depth": 1.5,
                "quantity": 113.4
              }
            ]
          }
        ]
      }
    ],
    "created_by_user": "EMP-001",
    "createdAt": "...",
    "updatedAt": "..."
  }
}
```

**Response `404`:**
```json
{ "status": false, "error": "Bill not found" }
```

---

## CSV Format

Hierarchy determined by the `Code` column:

| Code pattern | Level | Meaning |
|---|---|---|
| `Day-1`, `Day-2` | Day marker | Optional day grouping |
| `ID001`, `EW01` (2+ letters + digits) | Level 1 | Work item (main row) |
| `A`, `B`, `C` (single letter) | Level 2 | Measurement group |
| `1`, `1.1`, `2` (number) | Level 3 | Measurement sub-row |

| Column | Type | Notes |
|---|---|---|
| `Code` | string | Required — sets hierarchy level |
| `Description` | string | Item/measurement name |
| `Unit` | string | e.g. `Cum`, `Sqm` (Level 1) |
| `Nos1` | string | Number of units part 1 |
| `X` | string | Separator for `Nos1 × Nos2` |
| `Nos2` | string | Number of units part 2 |
| `Length` | number | |
| `Breadth` | number | |
| `Depth` | number | |
| `Quantity` | number | |
| `Mbook` | string | MB reference |

---

## Item Hierarchy

```
WorkItem (Level 1)                   ← item_code e.g. ID001
  └── MeasurementDetail (Level 2)    ← single letter e.g. A, B
        └── MeasurementDetailSub (Level 3)  ← number e.g. 1, 1.1
```

---

## Error Responses

| HTTP | When |
|---|---|
| 400 | Missing `tender_id` or `bill_id`, empty file |
| 404 | Document not found |
| 500 | Unexpected server error |
