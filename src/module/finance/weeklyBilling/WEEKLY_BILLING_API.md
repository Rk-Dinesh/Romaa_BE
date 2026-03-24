# Weekly Billing — API Reference

**Base URL:** `/weeklybilling`
**Module:** `finance → weeklyBilling`
**Auth:** JWT cookie or `Authorization: Bearer <token>` (currently commented out during development)

---

## Overview

The Weekly Billing module generates contractor bills from work-done records for a given date range.
Each bill contains **sub-bills** (one per work order), and each sub-bill's line items are stored separately in the transactions collection.

When a bill is set to `Approved`, a **Credit entry** is automatically posted to the supplier ledger — creating the payable to the contractor.

---

## Bill Number Format

| Field | Format | Example |
|---|---|---|
| `bill_no` | `WB/{tender_id}/{fin_year}/{seq:4}` | `WB/TND-001/25-26/0001` |
| `sub_bill_no` | `{bill_no}/S{sub_seq:2}` | `WB/TND-001/25-26/0001/S01` |

- Financial year is **Apr–Mar** (e.g. Apr 2025 – Mar 2026 → `25-26`)
- `fin_year` is **auto-computed by the server** from `bill_date` — the frontend never needs to send it
- Sequence resets per tender per financial year, guaranteed atomic (no duplicates under concurrent requests)

---

## Endpoints

### 1. List Bills for a Tender

```
GET /weeklybilling/api/list/:tenderId
```

**Auth required:** No (dev) / `finance > weeklyBilling > read` (prod)

**Success Response `200`**
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
      "contractor_id": "CTR-001",
      "contractor_name": "ABC Contractors",
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
GET /weeklybilling/api/detail/:billNo
```

> `bill_no` contains `/` — **always URL-encode it** before placing it in the URL path.
> The server decodes it automatically. A raw `/` causes a routing mismatch.
>
> `WB/TND-001/25-26/0001` → `WB%2FTND-001%2F25-26%2F0001`

**Example**
```
GET /weeklybilling/api/detail/WB%2FTND-001%2F25-26%2F0001
```

**Success Response `200`**
```json
{
  "status": true,
  "message": "Success",
  "data": {
    "_id": "664abc...",
    "bill_no": "WB/TND-001/25-26/0001",
    "contractor_name": "ABC Contractors",
    "base_amount": 5000,
    "gst_amount": 900,
    "total_amount": 5900,
    "status": "Generated",
    "sub_bills": [
      {
        "sub_bill_no": "WB/TND-001/25-26/0001/S01",
        "work_order_id": "WO-001",
        "sub_base_amount": 5000
      }
    ],
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
GET /weeklybilling/api/sub-bill/:subBillNo
```

> URL-encode `subBillNo` the same way as `billNo`.
> `WB/TND-001/25-26/0001/S01` → `WB%2FTND-001%2F25-26%2F0001%2FS01`

**Success Response `200`**
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

### 4. Contractor Work-Done Summary (for Generate Bill modal)

```
GET /weeklybilling/api/contractor-summary/:tenderId?fromDate=YYYY-MM-DD&toDate=YYYY-MM-DD
```

Call this first to populate the "Generate Bill" modal. Returns work-done records grouped by contractor → work order, with computed totals.

**Query Parameters**

| Param | Type | Required | Description |
|---|---|---|---|
| `fromDate` | `YYYY-MM-DD` | Yes | Start of billing period |
| `toDate` | `YYYY-MM-DD` | Yes | End of billing period (inclusive) |

**Success Response `200`**
```json
{
  "status": true,
  "message": "Success",
  "data": [
    {
      "contractor_name": "ABC Contractors",
      "contractor_id": "CTR-001",
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
          "items": [ "..." ]
        }
      ]
    }
  ]
}
```

---

### 5. Generate Bill

```
POST /weeklybilling/api/generate
Content-Type: application/json
```

**Auth required:** No (dev) / `finance > weeklyBilling > create` (prod)

**Request Body**

```json
{
  "tender_id":       "TND-001",
  "contractor_id":   "CTR-001",
  "contractor_name": "ABC Contractors",
  "from_date":       "2025-03-10",
  "to_date":         "2025-03-17",
  "gst_pct":         18,
  "created_by":      "Site Engineer",
  "sub_bills": [
    {
      "work_order_id":   "WO-001",
      "work_done_ids":   ["wd1", "wd2"],
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
      "work_order_id":   "WO-002",
      "work_done_ids":   ["wd3"],
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

**Request Fields**

| Field | Type | Required | Notes |
|---|---|---|---|
| `tender_id` | `string` | Yes | |
| `contractor_id` | `string` | Yes | Business key e.g. `CTR-001` |
| `contractor_name` | `string` | Yes | |
| `from_date` | `string` (date) | Yes | |
| `to_date` | `string` (date) | Yes | Must be ≥ `from_date` |
| `gst_pct` | `number` | No | Default `0` |
| `created_by` | `string` | No | Default `"Site Engineer"` |
| `fin_year` | — | — | **Auto-set by server** — do not send |
| `sub_bills` | `array` | Yes | Min 1 item |
| `sub_bills[].work_order_id` | `string` | Yes | One WO per sub-bill |
| `sub_bills[].work_done_ids` | `string[]` | Yes | WD record IDs included |
| `sub_bills[].items` | `array` | Yes | Line items |
| `sub_bills[].sub_base_amount` | `number` | No | Computed from items if omitted |
| `items[].work_order_id` | `string` | Yes | |
| `items[].work_done_id` | `string` | Yes | Source WorkOrderDone `_id` |
| `items[].item_description` | `string` | No | |
| `items[].description` | `string` | No | Zone / location note |
| `items[].quantity` | `number` | No | |
| `items[].unit` | `string` | No | |
| `items[].quoted_rate` | `number` | No | |
| `items[].amount` | `number` | No | `quantity × quoted_rate` |

**Success Response `201`**
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
    "status": "Generated"
  }
}
```

**Error — `409` Duplicate**
```json
{
  "status": false,
  "message": "Bill WB/TND-001/25-26/0001 already exists for ABC Contractors covering this date range."
}
```

> Generated bill starts in `Generated` status. No ledger entry is posted at this stage.

---

### 6. Update Bill Status

```
PATCH /weeklybilling/api/status/:billId
Content-Type: application/json
```

> Use the MongoDB `_id` of the bill (not `bill_no`).

**Auth required:** No (dev) / `finance > weeklyBilling > edit` (prod)

**Request Body**
```json
{ "status": "Approved" }
```

**Allowed Status Values**

| Status | Meaning | Ledger Effect |
|---|---|---|
| `Generated` | Bill created, not yet submitted | None |
| `Pending` | Submitted, awaiting approval | None |
| `Approved` | Approved by finance | **Posts Cr entry to contractor ledger** |
| `Cancelled` | Bill voided | None |

**Ledger Effect on `Approved`**

When status is set to `Approved`, a `LedgerEntry` is automatically created:

```
supplier_type : "Contractor"
vch_type      : "WeeklyBill"
credit_amt    : total_amount    ← Cr entry — liability created (you owe the contractor)
debit_amt     : 0
particulars   : "Weekly Bill WB/TND-001/25-26/0001 (2025-03-10 – 2025-03-17)"
```

> Duplicate protection is built in — if the same bill is accidentally set to Approved twice, the second attempt throws `500 postEntry: duplicate`.

**Success Response `200`**
```json
{
  "status": true,
  "message": "Bill status updated to Approved",
  "data": {
    "_id": "664abc...",
    "bill_no": "WB/TND-001/25-26/0001",
    "status": "Approved",
    "total_amount": 14160
  }
}
```

**Error — `400` Invalid Status**
```json
{
  "status": false,
  "message": "Invalid status. Allowed: Generated, Pending, Approved, Cancelled"
}
```

---

## Recommended UI Flow

### Generate Bill Modal

```
1. User selects tender + date range (from_date, to_date)
2. GET /weeklybilling/api/contractor-summary/:tenderId?fromDate=&toDate=
   → Populate contractor dropdown from response
3. User selects a contractor
   → Show sub_bills table (one row per work_order_id)
   → Show grand total (base_amount, gst_pct input, computed total)
4. User confirms
   → POST /weeklybilling/api/generate with the selected contractor's data
   → Show generated bill_no on success (status = "Generated")
```

### Bill Approval Flow

```
5. Finance reviews bill
   GET /weeklybilling/api/detail/:billNo   → full detail with line items

6. Finance approves
   PATCH /weeklybilling/api/status/:billId  { "status": "Approved" }
   → LedgerEntry posted (credit_amt = total_amount)
   → Contractor payable register updated

7. View updated ledger
   GET /ledger/supplier/CTR-001            → contractor ledger with new entry
   GET /ledger/balance/CTR-001             → updated outstanding balance
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
|---|---|
| `400` | Missing / invalid fields |
| `404` | Bill not found |
| `409` | Duplicate bill (same contractor + overlapping date range) |
| `500` | Internal server error |

---

## URL Encoding Reference

`bill_no` and `sub_bill_no` contain `/` which is a URL path separator.
**Always URL-encode them** before placing in a URL path.

```js
const billNo    = "WB/TND-001/25-26/0001";
const subBillNo = "WB/TND-001/25-26/0001/S01";

fetch(`/weeklybilling/api/detail/${encodeURIComponent(billNo)}`);
// → GET /weeklybilling/api/detail/WB%2FTND-001%2F25-26%2F0001

fetch(`/weeklybilling/api/sub-bill/${encodeURIComponent(subBillNo)}`);
// → GET /weeklybilling/api/sub-bill/WB%2FTND-001%2F25-26%2F0001%2FS01
```

> **Always use `encodeURIComponent()`** — not `encodeURI()`, which does not encode `/`.
