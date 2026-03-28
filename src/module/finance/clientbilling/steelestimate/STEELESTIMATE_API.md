# Steel Estimate — Frontend Integration Guide

## Overview

The Steel Estimate module stores **steel reinforcement (rebar) quantity data** per bill. Like the Billing Estimate, a single bill can have multiple steel estimate types differentiated by `abstract_name`.

**Workflow:**
1. Create a Client Bill first (`POST /clientbilling/create`)
2. Upload a steel estimate CSV for that bill (`POST /steelestimate/upload-csv`)
3. Fetch the steel estimate detail (`GET /steelestimate/details/:tender_id/:bill_id/:abstract_name`)

---

## Authentication

All endpoints require JWT (configured at the router level).

Permission required: `finance > clientbilling`

---

## Endpoints

| Method | URL | Description |
|--------|-----|-------------|
| `POST` | `/steelestimate/upload-csv` | Upload or replace a steel estimate CSV |
| `GET` | `/steelestimate/details/:tender_id/:bill_id/:abstract_name` | Full steel estimate detail |

---

## POST /steelestimate/upload-csv

Upload a CSV to create or replace a steel estimate for a bill.

- If an estimate with the same `{ tender_id, bill_id, abstract_name }` exists, its items are **replaced** (upsert).

**Content-Type:** `multipart/form-data`

**Form fields**

| Field | Required | Description |
|-------|---------|-------------|
| `file` | Yes | CSV or XLSX file |
| `tender_id` | Yes | e.g. `TND-001` |
| `bill_id` | Yes | e.g. `CB/25-26/0001` |
| `abstract_name` | Yes | e.g. `Steel Estimate`, `Foundation Steel` |
| `created_by_user` | No | Employee ID |

---

### CSV Format

The CSV uses the same **hierarchical level system** as Billing Estimate, determined by the `Code` column:

| Code pattern | Level | Meaning |
|---|---|---|
| `Day-1`, `Day-2` … | Day marker | Groups items by day (optional) |
| `ID001`, `SS01` (2+ letters + digits) | Level 1 | Steel work item (main row) |
| `A`, `B`, `C` (single letter) | Level 2 | Measurement group |
| `1`, `1.1`, `2` (number) | Level 3 | Individual bar measurement |

**CSV columns**

| Column | Type | Notes |
|--------|------|-------|
| `Code` | string | Determines hierarchy level (required) |
| `Description` | string | Item/element name |
| `Nos1` | string | Number of units part 1 |
| `X` | string | Separator (e.g. `×`) |
| `Nos2` | string | Number of units part 2 |
| `CUTTING LENGTH` | number | Bar cutting length (Level 3) |
| `UNIT WEIGHT` | number | Weight per unit length (Level 3) |
| `8mm` | number | Quantity for 8mm dia bars |
| `10mm` | number | Quantity for 10mm dia bars |
| `12mm` | number | Quantity for 12mm dia bars |
| `16mm` | number | Quantity for 16mm dia bars |
| `20mm` | number | Quantity for 20mm dia bars |
| `25mm` | number | Quantity for 25mm dia bars |
| `32mm` | number | Quantity for 32mm dia bars |
| `Total Weight` | number | Total weight (Level 1 summary row) |
| `Qtl` | number | Quantity in quintals (Level 1 summary row) |

**Example CSV**
```
Code,Description,Nos1,X,Nos2,CUTTING LENGTH,UNIT WEIGHT,8mm,10mm,12mm,16mm,20mm,25mm,32mm,Total Weight,Qtl
ID001,Foundation Columns,,,,,,,,,,,,,450,4.5
A,Col C1,,,,,,,,,,,,,,
1,Main bars,4,X,2,3.2,0.617,,,,120,,,,,
1.1,Stirrups,20,X,,0.8,0.395,80,,,,,,,,
ID002,Plinth Beams,,,,,,,,,,,,,320,3.2
```

**Response `200`**
```json
{
  "status": true,
  "message": "Successfully processed 'Steel Estimate' (ID: CB/25-26/0001). Items: 8",
  "data": {
    "_id": "...",
    "tender_id": "TND-001",
    "bill_id": "CB/25-26/0001",
    "abstract_name": "Steel Estimate",
    "items": [ /* parsed steel work items */ ],
    "created_by_user": "EMP-001",
    "createdAt": "...",
    "updatedAt": "..."
  }
}
```

---

## GET /steelestimate/details/:tender_id/:bill_id/:abstract_name

Returns the full steel estimate document.

**Example:** `GET /steelestimate/details/TND-001/CB%2F25-26%2F0001/Steel%20Estimate`

> URL-encode the `bill_id` — the `/` becomes `%2F`

**Response `200`**
```json
{
  "status": true,
  "message": "Detailed bill fetched successfully",
  "data": {
    "_id": "...",
    "tender_id": "TND-001",
    "bill_id": "CB/25-26/0001",
    "abstract_name": "Steel Estimate",
    "items": [
      {
        "_id": "...",
        "item_code": "ID001",
        "item_name": "Foundation Columns",
        "day": "",
        "mm_8": 0,
        "mm_10": 0,
        "mm_12": 0,
        "mm_16": 120,
        "mm_20": 0,
        "mm_25": 0,
        "mm_32": 0,
        "total_weight": 450,
        "qtl": 4.5,
        "details": [
          {
            "_id": "...",
            "description": "Col C1",
            "details": [
              {
                "_id": "...",
                "description": "Main bars",
                "nos": "4X2",
                "cutting_length": 3.2,
                "unit_weight": 0.617,
                "mm_8": 0,
                "mm_10": 0,
                "mm_12": 0,
                "mm_16": 120,
                "mm_20": 0,
                "mm_25": 0,
                "mm_32": 0
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

---

## Data structure

### Item hierarchy (3 levels)

```
WorkItem (Level 1)              ← item_code like ID001 — has totals (total_weight, qtl, mm_Xmm)
  └── MeasurementDetail (Level 2)    ← single letter code — groups bars by element
        └── MeasurementDetailSub (Level 3)  ← numeric code — individual bar row
```

### WorkItem fields (Level 1)

| Field | Type | Description |
|-------|------|-------------|
| `item_code` | string | Level 1 code (e.g. `ID001`) |
| `item_name` | string | Element name (e.g. `Foundation Columns`) |
| `day` | string | Day marker if CSV uses Day grouping |
| `mm_8` … `mm_32` | number | Total qty per dia at item level |
| `total_weight` | number | Total steel weight |
| `qtl` | number | Weight in quintals |
| `details` | array | Level 2 measurement groups |

### MeasurementDetailSub fields (Level 3)

| Field | Type | Description |
|-------|------|-------------|
| `description` | string | Bar description |
| `nos` | string | Number of bars (e.g. `4X2`) |
| `cutting_length` | number | Cutting length per bar |
| `unit_weight` | number | Weight per metre for this dia |
| `mm_8` … `mm_32` | number | Quantity for each dia |

---

## Error responses

```json
{ "status": false, "error": "Human-readable reason" }
```

| HTTP | When |
|------|------|
| 400 | Missing field, empty file, parse error |
| 500 | Unexpected server error |
