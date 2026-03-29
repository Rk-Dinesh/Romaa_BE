# Steel Estimate Module

Stores **steel reinforcement (rebar) quantity data** linked to a client bill. One document per `{ tender_id, bill_id }` — items are replaced on re-upload.

---

## Workflow

1. Upload a Client Bill (`POST /clientbilling/upload-csv`)
2. Upload the steel estimate CSV for that bill (`POST /steelestimate/upload-csv`)
3. Fetch full estimate detail (`GET /steelestimate/details?tender_id=&bill_id=`)

---

## API Reference

Base prefix: `/steelestimate`

---

### POST `/upload-csv`

Upload a CSV to create or replace the steel estimate for a bill.

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
  "message": "Successfully processed bill CB/25-26/0001. Items: 8",
  "data": { /* steel estimate document */ }
}
```

---

### GET `/details?tender_id=TND-001&bill_id=CB/25-26/0001`

Returns the full steel estimate document.

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
        "item_name": "Foundation Columns",
        "day": "",
        "mm_8": 0, "mm_10": 0, "mm_12": 0, "mm_16": 120,
        "mm_20": 0, "mm_25": 0, "mm_32": 0,
        "total_weight": 450,
        "qtl": 4.5,
        "details": [
          {
            "description": "Col C1",
            "details": [
              {
                "description": "Main bars",
                "nos": "4X2",
                "cutting_length": 3.2,
                "unit_weight": 0.617,
                "mm_16": 120
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
{ "status": false, "error": "Steel estimate not found" }
```

---

## CSV Format

Hierarchy determined by the `Code` column:

| Code pattern | Level | Meaning |
|---|---|---|
| `Day-1`, `Day-2` | Day marker | Optional day grouping |
| `ID001`, `SS01` (2+ letters + digits) | Level 1 | Steel work item |
| `A`, `B`, `C` (single letter) | Level 2 | Measurement group |
| `1`, `1.1`, `2` (number) | Level 3 | Individual bar row |

| Column | Type | Notes |
|---|---|---|
| `Code` | string | Required — sets hierarchy level |
| `Description` | string | Item/element name |
| `Nos1` | string | Number of bars part 1 |
| `X` | string | Separator e.g. `×` |
| `Nos2` | string | Number of bars part 2 |
| `CUTTING LENGTH` | number | Bar cutting length (Level 3) |
| `UNIT WEIGHT` | number | Weight per unit length (Level 3) |
| `8mm` – `32mm` | number | Quantity per dia |
| `Total Weight` | number | Total weight (Level 1) |
| `Qtl` | number | Weight in quintals (Level 1) |

---

## Item Hierarchy

```
WorkItem (Level 1)                        ← item_code e.g. ID001 — has totals
  └── MeasurementDetail (Level 2)         ← single letter e.g. A, B
        └── MeasurementDetailSub (Level 3) ← number e.g. 1, 1.1 — individual bar row
```

### WorkItem fields (Level 1)

| Field | Description |
|---|---|
| `item_code` | e.g. `ID001` |
| `item_name` | Element name |
| `day` | Day marker if CSV uses Day grouping |
| `mm_8` – `mm_32` | Total qty per dia |
| `total_weight` | Total steel weight |
| `qtl` | Weight in quintals |

### MeasurementDetailSub fields (Level 3)

| Field | Description |
|---|---|
| `description` | Bar description |
| `nos` | Number of bars e.g. `4X2` |
| `cutting_length` | Cutting length per bar |
| `unit_weight` | Weight per metre |
| `mm_8` – `mm_32` | Quantity per dia |

---

## Error Responses

| HTTP | When |
|---|---|
| 400 | Missing `tender_id` or `bill_id`, empty file |
| 404 | Document not found |
| 500 | Unexpected server error |
