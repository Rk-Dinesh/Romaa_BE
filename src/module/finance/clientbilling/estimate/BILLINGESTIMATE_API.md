# Billing Estimate — Frontend Integration Guide

## Overview

The Billing Estimate module stores the detailed **measurement book (MB) data** that backs a Client Bill. A single bill can have multiple estimate types (e.g. "Abstract Estimate", "Concrete Estimate") — each is a separate document identified by `abstract_name`.

**Workflow:**
1. Create a Client Bill first (`POST /clientbilling/create`)
2. Upload one or more estimate CSVs for that bill (`POST /clientbilling/estimate/upload-csv`)
3. View uploaded estimates for a bill (`GET /clientbilling/estimate/list/:tender_id/:bill_id`)
4. Fetch full detail of one estimate (`GET /clientbilling/estimate/details/:tender_id/:bill_id/:abstract_name`)

---

## Authentication

All endpoints require JWT. Send via:
- Cookie: `accessToken`
- Header: `Authorization: Bearer <token>`

Permission required: `finance > clientbilling`

---

## Endpoints

| Method | URL | Permission | Description |
|--------|-----|-----------|-------------|
| `POST` | `/clientbilling/estimate/upload-csv` | create | Upload or replace an estimate CSV for a bill |
| `GET` | `/clientbilling/estimate/list/:tender_id/:bill_id` | read | List all estimate types for a bill |
| `GET` | `/clientbilling/estimate/details/:tender_id/:bill_id/:abstract_name` | read | Full detail of one estimate |

---

## POST /clientbilling/estimate/upload-csv

Upload a CSV file to create or replace an estimate for an existing bill.

- If an estimate with the same `{ tender_id, bill_id, abstract_name }` already exists, its items are **replaced** (upsert).
- The bill (`bill_id`) must already exist before uploading.

**Content-Type:** `multipart/form-data`

**Form fields**

| Field | Required | Description |
|-------|---------|-------------|
| `file` | Yes | CSV or XLSX file |
| `tender_id` | Yes | e.g. `TND-001` |
| `bill_id` | Yes | e.g. `CB/25-26/0001` — must exist |
| `abstract_name` | Yes | e.g. `Abstract Estimate`, `Concrete Estimate` |
| `created_by_user` | No | Employee ID |

---

### CSV Format

The CSV uses a **hierarchical level system** determined by the `Code` column:

| Code pattern | Level | Meaning |
|---|---|---|
| `Day-1`, `Day-2` … | Day marker | Groups items by day (optional) |
| `ID001`, `EW01` (2+ letters + digits) | Level 1 | Work item (main row) |
| `A`, `B`, `C` (single letter) | Level 2 | Measurement group |
| `1`, `1.1`, `2` (number) | Level 3 | Measurement sub-row |

**CSV columns**

| Column | Type | Notes |
|--------|------|-------|
| `Code` | string | Determines hierarchy level (required) |
| `Description` | string | Item/measurement name |
| `Unit` | string | e.g. `Cum`, `Sqm` (Level 1 only) |
| `Nos1` | string | Number of units part 1 |
| `X` | string | Separator for `Nos1 × Nos2` |
| `Nos2` | string | Number of units part 2 |
| `Length` | number | |
| `Breadth` | number | |
| `Depth` | number | |
| `Quantity` | number | |
| `Mbook` | string | Measurement book reference |

**Example CSV**
```
Code,Description,Unit,Nos1,X,Nos2,Length,Breadth,Depth,Quantity,Mbook
ID001,Earth Work Excavation,Cum,,,,,,,,MB-12
A,Foundation Trench,,,,,,,,
1,Grid A-B,,2,X,3,10.5,1.2,1.5,113.4,
1.1,Extra depth,,,,,,,,
ID002,PCC 1:4:8,Cum,,,,,,,,MB-13
```

**Response `200`**
```json
{
  "status": true,
  "message": "'Abstract Estimate' uploaded for bill CB/25-26/0001. Items: 12",
  "data": {
    "_id": "...",
    "tender_id": "TND-001",
    "bill_id": "CB/25-26/0001",
    "abstract_name": "Abstract Estimate",
    "items": [ /* parsed work items */ ],
    "created_by_user": "EMP-001",
    "createdAt": "...",
    "updatedAt": "..."
  }
}
```

---

## GET /clientbilling/estimate/list/:tender_id/:bill_id

Returns a summary list of all estimate types uploaded for a given bill.

**Example:** `GET /clientbilling/estimate/list/TND-001/CB%2F25-26%2F0001`

> URL-encode the `bill_id` — the `/` becomes `%2F`

**Response `200`**
```json
{
  "status": true,
  "count": 2,
  "data": [
    {
      "_id": "...",
      "bill_id": "CB/25-26/0001",
      "abstract_name": "Abstract Estimate",
      "createdAt": "2026-03-10T09:15:00.000Z"
    },
    {
      "_id": "...",
      "bill_id": "CB/25-26/0001",
      "abstract_name": "Concrete Estimate",
      "createdAt": "2026-03-10T10:00:00.000Z"
    }
  ]
}
```

---

## GET /clientbilling/estimate/details/:tender_id/:bill_id/:abstract_name

Returns the full estimate document including all items and measurement details.

**Example:** `GET /clientbilling/estimate/details/TND-001/CB%2F25-26%2F0001/Abstract%20Estimate`

**Response `200`**
```json
{
  "status": true,
  "data": {
    "_id": "...",
    "tender_id": "TND-001",
    "bill_id": "CB/25-26/0001",
    "abstract_name": "Abstract Estimate",
    "items": [
      {
        "_id": "...",
        "item_code": "ID001",
        "item_name": "Earth Work Excavation",
        "unit": "Cum",
        "day": "",
        "quantity": 113.4,
        "mb_book_ref": "MB-12",
        "details": [
          {
            "_id": "...",
            "description": "Foundation Trench",
            "nos": "",
            "length": 0,
            "breadth": 0,
            "depth": 0,
            "quantity": 0,
            "details": [
              {
                "_id": "...",
                "description": "Grid A-B",
                "nos": "2X3",
                "length": 10.5,
                "breadth": 1.2,
                "depth": 1.5,
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

**Response `404`** — estimate not found
```json
{ "status": false, "message": "Estimate not found" }
```

---

## Data structure

### Item hierarchy (3 levels)

```
WorkItem (Level 1)          ← item_code like ID001
  └── MeasurementDetail (Level 2)   ← single letter code like A, B
        └── MeasurementDetailSub (Level 3)  ← numeric code like 1, 1.1
```

### WorkItem fields

| Field | Type | Description |
|-------|------|-------------|
| `item_code` | string | Level 1 code (e.g. `ID001`) |
| `item_name` | string | Description |
| `unit` | string | Unit of measurement |
| `day` | string | Day marker if CSV has Day-1/Day-2 grouping |
| `quantity` | number | Total quantity |
| `mb_book_ref` | string | Measurement book reference |
| `details` | array | Level 2 measurement groups |

---

## Error responses

```json
{ "status": false, "message": "Human-readable reason" }
```

| HTTP | When |
|------|------|
| 400 | Missing field, bill not found, empty file |
| 404 | Estimate not found |
| 500 | Unexpected server error |
