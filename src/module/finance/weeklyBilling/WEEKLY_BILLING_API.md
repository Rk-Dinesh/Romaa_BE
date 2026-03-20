# Weekly Billing — Frontend Integration Guide

## Overview

The Weekly Billing module generates vendor bills from work-done records for a given date range.
Each bill contains **sub-bills** (one per work order), and each sub-bill's line items are stored separately in the transactions collection.

---

## Bill Number Format

| Field | Format | Example |
|-------|--------|---------|
| `bill_no` | `WB/{tender_id}/{fin_year}/{seq:4}` | `WB/TND-001/25-26/0001` |
| `sub_bill_no` | `{bill_no}/S{sub_seq:2}` | `WB/TND-001/25-26/0001/S01` |

- Financial year is **Apr–Mar** (e.g. Apr 2025 – Mar 2026 → `25-26`)
- `fin_year` is **auto-computed by the server** from `bill_date` — the frontend never needs to send it
- Sequence resets per tender per financial year

---

## Base URL

```
/weeklyBilling
```

---

## Endpoints

### 1. List Bills for a Tender

```
GET /weeklyBilling/api/list/:tenderId
```

**Response**
```json
{
  "status": true,
  "message": "Success",
  "data": [
    {
      "_id": "664abc...",
      "bill_no": "WB/TND-001/25-26/0001",
      "bill_date": "2025-03-17T00:00:00.000Z",
      "tender_id": "TND-001",
      "vendor_id": "VND-001",
      "vendor_name": "ABC Contractors",
      "fin_year": "25-26",
      "from_date": "2025-03-10T00:00:00.000Z",
      "to_date": "2025-03-17T00:00:00.000Z",
      "sub_bills": [
        {
          "sub_bill_no": "WB/TND-001/25-26/0001/S01",
          "work_order_id": "WO-001",
          "work_done_ids": ["wd1", "wd2"],
          "sub_base_amount": 5000
        }
      ],
      "base_amount": 5000,
      "gst_pct": 18,
      "gst_amount": 900,
      "total_amount": 5900,
      "status": "Generated",
      "created_by": "Site Engineer",
      "createdAt": "2025-03-17T10:30:00.000Z"
    }
  ]
}
```

---

### 2. Get Bill Detail (with line items)

```
GET /weeklyBilling/api/detail/:billNo
```

> `bill_no` contains `/` — **always URL-encode it** before placing it in the URL path.
> The server decodes it automatically. Sending a raw `/` will cause a routing mismatch.
>
> `WB/TND-001/25-26/0001` → `WB%2FTND-001%2F25-26%2F0001`

**Example**
```
GET /weeklyBilling/api/detail/WB%2FTND-001%2F25-26%2F0001
```

**Response**
```json
{
  "status": true,
  "message": "Success",
  "data": {
    "_id": "664abc...",
    "bill_no": "WB/TND-001/25-26/0001",
    "vendor_name": "ABC Contractors",
    "sub_bills": [ ... ],
    "base_amount": 5000,
    "gst_amount": 900,
    "total_amount": 5900,
    "status": "Generated",
    "transactions": [
      {
        "_id": "664def...",
        "bill_no": "WB/TND-001/25-26/0001",
        "sub_bill_no": "WB/TND-001/25-26/0001/S01",
        "work_order_id": "WO-001",
        "work_done_id": "wd1",
        "item_description": "Excavation",
        "description": "Zone A",
        "quantity": 10,
        "unit": "cum",
        "quoted_rate": 500,
        "amount": 5000,
        "status": "Generated"
      }
    ]
  }
}
```

---

### 3. Get Line Items for a Sub-Bill

```
GET /weeklyBilling/api/sub-bill/:subBillNo
```

> URL-encode `subBillNo` the same way as `billNo`.
> `WB/TND-001/25-26/0001/S01` → `WB%2FTND-001%2F25-26%2F0001%2FS01`
>
> The server decodes it automatically. Sending a raw `/` will cause a routing mismatch.

**Response**
```json
{
  "status": true,
  "message": "Success",
  "data": [
    {
      "bill_no": "WB/TND-001/25-26/0001",
      "sub_bill_no": "WB/TND-001/25-26/0001/S01",
      "work_order_id": "WO-001",
      "work_done_id": "wd1",
      "item_description": "Excavation",
      "quantity": 10,
      "unit": "cum",
      "quoted_rate": 500,
      "amount": 5000
    }
  ]
}
```

---

### 4. Vendor Work-Done Summary (for Generate Bill modal)

```
GET /weeklyBilling/api/vendor-summary/:tenderId?fromDate=YYYY-MM-DD&toDate=YYYY-MM-DD
```

Call this first to populate the "Generate Bill" modal.
Returns work-done records grouped by vendor → work order, with computed totals.

**Query Params**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `fromDate` | `YYYY-MM-DD` | Yes | Start of billing period |
| `toDate` | `YYYY-MM-DD` | Yes | End of billing period (inclusive) |

**Response**
```json
{
  "status": true,
  "message": "Success",
  "data": [
    {
      "vendor_name": "ABC Contractors",
      "vendor_id": "VND-001",
      "base_amount": 12000,
      "sub_bills": [
        {
          "work_order_id": "WO-001",
          "work_done_ids": ["wd1", "wd2"],
          "sub_base_amount": 7000,
          "items": [
            {
              "work_order_id": "WO-001",
              "work_done_id": "wd1",
              "item_description": "Excavation",
              "description": "Zone A",
              "quantity": 10,
              "unit": "cum",
              "quoted_rate": 500,
              "amount": 5000
            },
            {
              "work_order_id": "WO-001",
              "work_done_id": "wd2",
              "item_description": "Backfilling",
              "description": "",
              "quantity": 4,
              "unit": "cum",
              "quoted_rate": 500,
              "amount": 2000
            }
          ]
        },
        {
          "work_order_id": "WO-002",
          "work_done_ids": ["wd3"],
          "sub_base_amount": 5000,
          "items": [ ... ]
        }
      ]
    }
  ]
}
```

---

### 5. Generate Bill

```
POST /weeklyBilling/api/generate
Content-Type: application/json
```

**Request Body**

```json
{
  "tender_id":   "TND-001",
  "vendor_id":   "VND-001",
  "vendor_name": "ABC Contractors",
  "from_date":   "2025-03-10",
  "to_date":     "2025-03-17",
  "gst_pct":     18,
  "created_by":  "Site Engineer",
  "sub_bills": [
    {
      "work_order_id":  "WO-001",
      "work_done_ids":  ["wd1", "wd2"],
      "sub_base_amount": 7000,
      "items": [
        {
          "work_order_id":    "WO-001",
          "work_done_id":     "wd1",
          "item_description": "Excavation",
          "description":      "Zone A",
          "quantity":         10,
          "unit":             "cum",
          "quoted_rate":      500,
          "amount":           5000
        },
        {
          "work_order_id":    "WO-001",
          "work_done_id":     "wd2",
          "item_description": "Backfilling",
          "description":      "",
          "quantity":         4,
          "unit":             "cum",
          "quoted_rate":      500,
          "amount":           2000
        }
      ]
    },
    {
      "work_order_id":  "WO-002",
      "work_done_ids":  ["wd3"],
      "sub_base_amount": 5000,
      "items": [
        {
          "work_order_id":    "WO-002",
          "work_done_id":     "wd3",
          "item_description": "Concreting",
          "description":      "Column C1",
          "quantity":         5,
          "unit":             "cum",
          "quoted_rate":      1000,
          "amount":           5000
        }
      ]
    }
  ]
}
```

**Field Reference**

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `tender_id` | String | Yes | |
| `vendor_id` | String | Yes | |
| `vendor_name` | String | Yes | |
| `from_date` | String (date) | Yes | |
| `to_date` | String (date) | Yes | Must be ≥ `from_date` |
| `gst_pct` | Number | No | Default `0` |
| `created_by` | String | No | Default `"Site Engineer"` |
| `fin_year` | — | — | **Auto-set by server** — do not send |
| `sub_bills` | Array | Yes | Min 1 item |
| `sub_bills[].work_order_id` | String | Yes | One per sub-bill |
| `sub_bills[].work_done_ids` | String[] | Yes | WD records included |
| `sub_bills[].items` | Array | Yes | Line items |
| `sub_bills[].sub_base_amount` | Number | No | Computed from items if omitted |
| `items[].work_order_id` | String | Yes | |
| `items[].work_done_id` | String | Yes | Source WorkOrderDone `_id` |
| `items[].item_description` | String | No | |
| `items[].description` | String | No | |
| `items[].quantity` | Number | No | |
| `items[].unit` | String | No | |
| `items[].quoted_rate` | Number | No | |
| `items[].amount` | Number | No | `quantity × quoted_rate` |

**Success Response — 201**
```json
{
  "status": true,
  "message": "Bill generated successfully",
  "data": {
    "_id": "664abc...",
    "bill_no": "WB/TND-001/25-26/0001",
    "fin_year": "25-26",
    "base_amount": 12000,
    "gst_amount": 2160,
    "total_amount": 14160,
    "status": "Generated",
    ...
  }
}
```

**Error — 409 Duplicate**
```json
{
  "status": false,
  "message": "Bill WB/TND-001/25-26/0001 already exists for ABC Contractors covering this date range."
}
```

---

### 6. Update Bill Status

```
PATCH /weeklyBilling/api/status/:billId
Content-Type: application/json
```

> Use the MongoDB `_id` of the bill (not `bill_no`).

**Request Body**
```json
{ "status": "Paid" }
```

**Allowed Status Transitions**

```
Generated → Pending → Paid
Generated → Cancelled
Pending   → Cancelled
```

| Status | Meaning |
|--------|---------|
| `Generated` | Bill created, not yet submitted |
| `Pending` | Submitted, awaiting payment |
| `Paid` | Payment received |
| `Cancelled` | Bill voided |

**Success Response**
```json
{
  "status": true,
  "message": "Bill status updated to Paid",
  "data": { "_id": "...", "status": "Paid", ... }
}
```

**Error — 400 Invalid Status**
```json
{
  "status": false,
  "message": "Invalid status. Allowed: Generated, Pending, Paid, Cancelled"
}
```

---

## Recommended UI Flow

### Generate Bill Modal

```
1. User selects tender + date range (from_date, to_date)
2. Call GET /vendor-summary/:tenderId?fromDate=&toDate=
   → Populate vendor dropdown from response
3. User selects a vendor
   → Show sub_bills table (one row per work_order_id)
   → Show grand total (base_amount, gst_pct input, computed total)
4. User confirms
   → Call POST /generate with the selected vendor's data
   → Show generated bill_no on success
```

### Bill Detail View

```
1. Call GET /list/:tenderId to show the bills table
2. On row click → Call GET /detail/:billNo (URL-encode bill_no)
   → Show bill header info
   → Group transactions by sub_bill_no for display
3. Status badge shows current status
4. "Update Status" button → Call PATCH /status/:billId
```

---

## Error Response Format

All errors follow this shape:

```json
{
  "status": false,
  "message": "<reason>"
}
```

| HTTP Code | Meaning |
|-----------|---------|
| `400` | Missing / invalid fields |
| `404` | Bill not found |
| `409` | Duplicate bill for same vendor + overlapping date range |
| `500` | Internal server error |

---

## URL Encoding Reference

`bill_no` and `sub_bill_no` contain `/` which is a path separator.
**Always URL-encode them** before placing in a URL path — the server decodes automatically.
Sending a raw `/` will cause a 404 routing mismatch.

```js
// Encode before use
const billNo    = "WB/TND-001/25-26/0001";
const subBillNo = "WB/TND-001/25-26/0001/S01";

fetch(`/weeklyBilling/api/detail/${encodeURIComponent(billNo)}`);
// → GET /weeklyBilling/api/detail/WB%2FTND-001%2F25-26%2F0001

fetch(`/weeklyBilling/api/sub-bill/${encodeURIComponent(subBillNo)}`);
// → GET /weeklyBilling/api/sub-bill/WB%2FTND-001%2F25-26%2F0001%2FS01
```

> **Note:** Do NOT use `encodeURI()` — it does not encode `/`.
> Always use `encodeURIComponent()` for path segments that may contain `/`.
