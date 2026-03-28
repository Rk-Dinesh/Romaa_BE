# Client Billing — Frontend Integration Guide

## Overview

The client billing module handles RA (Running Account) bills raised against clients for work done on a tender. It covers the full lifecycle: draft → approval → payment tracking, with deductions, GST, retention, and ledger posting on approval.

### Related modules in this folder

| Module | Base URL | Purpose |
|--------|----------|---------|
| Client Bill | `/clientbilling` | Main RA bill document |
| Billing Estimate | `/clientbilling/estimate` | Detailed measurement backing a bill |
| Steel Estimate | `/steelestimate` | Steel quantity estimate per bill |
| Client Credit Note | `/clientbilling/creditnote` | Reduce a bill after approval |

---

## Bill Lifecycle

```
Draft → Submitted → Checked → Approved → Paid
              ↘              ↗
            Rejected
```

- **Draft** — editable, deletable
- **Submitted** — sent for review (still editable)
- **Checked** — reviewed internally
- **Approved** — locked, ledger entry posted (client owes Romaa)
- **Paid** — payment fully received
- **Rejected** — cannot be approved again; create a new bill

> Use `PATCH /approve/:id` for the Approved transition only.
> Use `PATCH /status/:id` for all other transitions.

---

## Authentication

All endpoints require JWT. Send via:
- Cookie: `accessToken`
- Header: `Authorization: Bearer <token>`

Permission required: `finance > clientbilling`

---

---

# Part 1 — Client Bill

## Endpoints

| Method | URL | Permission | Description |
|--------|-----|-----------|-------------|
| `GET` | `/clientbilling/next-id` | read | Preview the next bill ID before creating |
| `GET` | `/clientbilling/list` | read | Paginated bill list with filters |
| `GET` | `/clientbilling/history/:tender_id` | read | All bills for a tender (chronological) |
| `GET` | `/clientbilling/details/:tender_id/:bill_id` | read | Full bill by tender + bill_id string |
| `GET` | `/clientbilling/:id` | read | Full bill by MongoDB `_id` |
| `POST` | `/clientbilling/create` | create | Create a new bill (JSON) |
| `POST` | `/clientbilling/upload-csv` | create | Create a bill from CSV file |
| `PATCH` | `/clientbilling/approve/:id` | edit | Approve bill + post to ledger |
| `PATCH` | `/clientbilling/status/:id` | edit | Change status (Draft/Submitted/Checked/Rejected) |
| `PATCH` | `/clientbilling/update/:id` | edit | Edit bill (Draft/Submitted/Checked only) |
| `DELETE` | `/clientbilling/delete/:id` | delete | Delete bill (Draft/Submitted/Checked only) |

---

## GET /clientbilling/next-id

Use this to show the auto-generated bill ID on the create form before submission.

**Response**
```json
{
  "status": true,
  "data": { "bill_id": "CB/25-26/0005" }
}
```

---

## GET /clientbilling/list

**Query params**

| Param | Type | Description |
|-------|------|-------------|
| `tender_id` | string | Filter by tender |
| `client_id` | string | Filter by client |
| `status` | string | Draft / Submitted / Checked / Approved / Paid / Rejected |
| `paid_status` | string | unpaid / partial / paid |
| `from_date` | ISO date | Bill date range start |
| `to_date` | ISO date | Bill date range end |
| `page` | number | Default 1 |
| `limit` | number | Default 20, max 100 |

**Response**
```json
{
  "status": true,
  "data": [
    {
      "_id": "...",
      "bill_id": "CB/25-26/0003",
      "bill_date": "2026-03-10T00:00:00.000Z",
      "tender_id": "TND-001",
      "tender_name": "Road Construction NH-44",
      "client_id": "CLT-001",
      "client_name": "NHAI",
      "grand_total": 250000,
      "net_amount": 271250,
      "amount_received": 0,
      "balance_due": 271250,
      "paid_status": "unpaid",
      "status": "Approved",
      "createdAt": "2026-03-10T09:15:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 3,
    "pages": 1
  }
}
```

---

## GET /clientbilling/history/:tender_id

Returns all bills for a tender sorted oldest-first. Use this for the billing history timeline on a project page.

**Response**
```json
{
  "status": true,
  "count": 3,
  "data": [
    {
      "bill_id": "CB/25-26/0001",
      "bill_date": "2026-01-05T00:00:00.000Z",
      "grand_total": 180000,
      "net_amount": 195480,
      "amount_received": 195480,
      "balance_due": 0,
      "paid_status": "paid",
      "status": "Paid"
    }
  ]
}
```

---

## GET /clientbilling/:id  &  GET /clientbilling/details/:tender_id/:bill_id

Both return the full bill document.

**Full bill response**
```json
{
  "status": true,
  "data": {
    "_id": "...",
    "bill_id": "CB/25-26/0003",
    "bill_date": "2026-03-10T00:00:00.000Z",
    "tender_id": "TND-001",
    "tender_name": "Road Construction NH-44",
    "client_id": "CLT-001",
    "client_name": "NHAI",
    "client_ref": "...",
    "previous_bill_id": "...",

    "items": [
      {
        "item_code": "EW-01",
        "item_name": "Earth Excavation",
        "unit": "m³",
        "rate": 400,
        "mb_book_ref": "MB-12/P-45",

        "agreement_qty": 5000,
        "agreement_amount": 2000000,

        "prev_bill_qty": 1200,
        "prev_bill_amount": 480000,

        "current_qty": 800,
        "current_amount": 320000,

        "upto_date_qty": 2000,
        "upto_date_amount": 800000,

        "excess_qty": 0,
        "excess_amount": 0,
        "excess_percentage": 0,

        "balance_qty": 3000,
        "balance_amount": 1200000,
        "balance_percentage": 60
      }
    ],

    "deductions": [
      { "description": "TDS @ 2%",                     "amount": 6400 },
      { "description": "Mobilization Advance Recovery", "amount": 20000 }
    ],
    "total_deductions": 26400,

    "tax_mode": "instate",
    "cgst_pct": 9,
    "sgst_pct": 9,
    "igst_pct": 0,
    "cgst_amt": 28800,
    "sgst_amt": 28800,
    "igst_amt": 0,
    "total_tax": 57600,

    "retention_pct": 5,
    "retention_amount": 16000,

    "grand_total": 320000,
    "total_upto_date_amount": 800000,
    "total_prev_bill_amount": 480000,
    "net_amount": 335200,

    "amount_received": 0,
    "balance_due": 335200,
    "paid_status": "unpaid",
    "payment_refs": [],

    "status": "Draft",
    "narration": "",
    "created_by_user": "EMP-001",
    "createdAt": "2026-03-10T09:15:00.000Z",
    "updatedAt": "2026-03-10T09:15:00.000Z"
  }
}
```

### Key computed fields explained

| Field | Formula | Used for |
|-------|---------|---------|
| `agreement_amount` | `agreement_qty × rate` | Agreement column in bill table |
| `prev_bill_amount` | `prev_bill_qty × rate` | Previous bill column |
| `current_amount` | `current_qty × rate` | This bill column |
| `upto_date_qty` | `current_qty + prev_bill_qty` | Cumulative progress |
| `upto_date_amount` | `upto_date_qty × rate` | Cumulative amount |
| `excess_qty` | `upto_date_qty − agreement_qty` (if > 0) | Over-billing alert |
| `balance_qty` | `agreement_qty − upto_date_qty` (if > 0) | Remaining scope |
| `grand_total` | `Σ current_amount` | Base bill amount |
| `total_tax` | `cgst_amt + sgst_amt + igst_amt` | GST total |
| `retention_amount` | `grand_total × retention_pct / 100` | Held by client |
| `total_deductions` | `Σ deductions[].amount` | TDS, advance recovery, etc. |
| `net_amount` | `grand_total + total_tax − retention_amount − total_deductions` | Final payable |
| `balance_due` | `net_amount − amount_received` | Outstanding |

---

## POST /clientbilling/create

Creates a bill. Client and tender details are auto-filled from the tender record — **do not send them**.

**Request body**
```json
{
  "tender_id": "TND-001",
  "bill_date": "2026-03-10",

  "items": [
    {
      "item_code": "EW-01",
      "item_name": "Earth Excavation",
      "unit": "m³",
      "rate": 400,
      "mb_book_ref": "MB-12/P-45",
      "agreement_qty": 5000,
      "prev_bill_qty": 1200,
      "current_qty": 800
    },
    {
      "item_code": "SB-02",
      "item_name": "Sub-base Compaction",
      "unit": "m³",
      "rate": 650,
      "mb_book_ref": "MB-12/P-46",
      "agreement_qty": 3000,
      "prev_bill_qty": 500,
      "current_qty": 300
    }
  ],

  "deductions": [
    { "description": "TDS @ 2%",                     "amount": 6400 },
    { "description": "Mobilization Advance Recovery", "amount": 20000 }
  ],

  "tax_mode": "instate",
  "cgst_pct": 9,
  "sgst_pct": 9,
  "igst_pct": 0,
  "retention_pct": 5,

  "narration": "3rd RA bill for earthwork and sub-base",
  "created_by_user": "EMP-001"
}
```

**Notes**
- `tender_id` is required — everything else is optional
- `prev_bill_qty` — copy from the previous bill's `current_qty` for each item
- `agreement_qty` — comes from the BOQ / contract for that item
- `tax_mode: "instate"` → send `cgst_pct` + `sgst_pct`; `igst_pct` is forced to 0
- `tax_mode: "otherstate"` → send `igst_pct` only; `cgst_pct` + `sgst_pct` are forced to 0
- All computed fields (`current_amount`, `upto_date_qty`, `net_amount`, etc.) are calculated by the server

**Response** `201`
```json
{
  "status": true,
  "message": "Bill CB/25-26/0003 created",
  "data": { /* full bill document */ }
}
```

---

## POST /clientbilling/upload-csv

Create a bill from a CSV file. Bill-level fields come as form fields; items come from the CSV rows.

**Content-Type:** `multipart/form-data`

**Form fields** (same as JSON create, minus `items`)

| Field | Required |
|-------|---------|
| `file` | Yes — CSV or XLSX |
| `tender_id` | Yes |
| `bill_date` | No |
| `tax_mode` | No |
| `cgst_pct`, `sgst_pct`, `igst_pct` | No |
| `retention_pct` | No |
| `narration` | No |
| `created_by_user` | No |

**CSV columns**

| Column | Type | Notes |
|--------|------|-------|
| `item_code` | string | |
| `item_name` | string | |
| `unit` | string | |
| `rate` | number | |
| `mb_book_ref` | string | |
| `agreement_qty` | number | |
| `prev_bill_qty` | number | |
| `current_qty` | number | |

CSV example:
```
item_code,item_name,unit,rate,mb_book_ref,agreement_qty,prev_bill_qty,current_qty
EW-01,Earth Excavation,m³,400,MB-12/P-45,5000,1200,800
SB-02,Sub-base Compaction,m³,650,MB-12/P-46,3000,500,300
```

---

## PATCH /clientbilling/update/:id

Edit a bill. Only allowed when status is **Draft**, **Submitted**, or **Checked**.

**Request body** — send only the fields you want to change
```json
{
  "bill_date": "2026-03-12",
  "items": [ /* full items array — replaces existing */ ],
  "deductions": [ /* full deductions array — replaces existing */ ],
  "retention_pct": 10,
  "tax_mode": "instate",
  "cgst_pct": 9,
  "sgst_pct": 9,
  "narration": "Updated note"
}
```

**Cannot edit:** `tender_id`, `client_id`, `bill_id`, `status`

---

## PATCH /clientbilling/approve/:id

Approves the bill and posts a **Dr entry** to the client ledger (client now owes Romaa the `net_amount`).

No request body needed.

**Error cases**
- Already `Approved` or `Paid` → 400
- Status is `Rejected` → 400
- No `client_id` on bill → 400

---

## PATCH /clientbilling/status/:id

**Request body**
```json
{ "status": "Submitted" }
```

Allowed values: `Draft`, `Submitted`, `Checked`, `Rejected`
Use `/approve/:id` for the `Approved` transition.

---

## DELETE /clientbilling/delete/:id

Permanently deletes the bill. Only allowed when status is **Draft**, **Submitted**, or **Checked**.

**Response**
```json
{ "status": true, "message": "Bill deleted", "data": { "deleted": true, "bill_id": "CB/25-26/0003" } }
```

---

## Error responses

All errors return:
```json
{ "status": false, "message": "Human-readable reason" }
```

| HTTP code | When |
|-----------|------|
| 400 | Validation failure, business rule violation |
| 404 | Bill not found |
| 500 | Unexpected server error |

---

---

# Part 2 — Client Credit Note

A Client Credit Note (CCN) formally reduces a bill after it has been approved. It is raised when the client disputes a quantity or rate after the bill is locked.

## Endpoints

| Method | URL | Permission | Description |
|--------|-----|-----------|-------------|
| `GET` | `/clientbilling/creditnote/list` | read | Paginated CCN list with filters |
| `GET` | `/clientbilling/creditnote/:id` | read | Full CCN by MongoDB `_id` |
| `POST` | `/clientbilling/creditnote/create` | create | Create a new CCN |
| `PATCH` | `/clientbilling/creditnote/approve/:id` | edit | Approve CCN + post to ledger |
| `PATCH` | `/clientbilling/creditnote/status/:id` | edit | Draft / Submitted / Rejected |
| `PATCH` | `/clientbilling/creditnote/update/:id` | edit | Edit while Draft/Submitted |
| `DELETE` | `/clientbilling/creditnote/delete/:id` | delete | Delete Draft/Rejected only |

## CCN Lifecycle

```
Draft → Submitted → Approved
           ↘
         Rejected
```

Approved CCN posts a **Cr entry** to the client ledger — reducing what the client owes.

---

## GET /clientbilling/creditnote/list

**Query params**

| Param | Type | Description |
|-------|------|-------------|
| `tender_id` | string | Filter by tender |
| `client_id` | string | Filter by client |
| `bill_id` | string | Filter by original bill |
| `status` | string | Draft / Submitted / Approved / Rejected |
| `from_date` | ISO date | CCN date range start |
| `to_date` | ISO date | CCN date range end |
| `page` | number | Default 1 |
| `limit` | number | Default 20, max 100 |

---

## GET /clientbilling/creditnote/:id

**Full CCN response**
```json
{
  "status": true,
  "data": {
    "_id": "...",
    "ccn_no": "CCN/25-26/0001",
    "ccn_date": "2026-03-20T00:00:00.000Z",
    "bill_ref": "...",
    "bill_id": "CB/25-26/0003",
    "tender_id": "TND-001",
    "tender_name": "Road Construction NH-44",
    "client_id": "CLT-001",
    "client_name": "NHAI",
    "items": [
      {
        "item_code": "EW-01",
        "item_name": "Earth Excavation",
        "unit": "m³",
        "rate": 400,
        "return_qty": 80,
        "return_amount": 32000
      }
    ],
    "reason": "Client re-measured Earth Excavation at site — 80m³ rejected",
    "grand_total": 32000,
    "tax_mode": "instate",
    "cgst_pct": 9,
    "sgst_pct": 9,
    "igst_pct": 0,
    "cgst_amt": 2880,
    "sgst_amt": 2880,
    "igst_amt": 0,
    "total_tax": 5760,
    "net_amount": 37760,
    "status": "Draft",
    "narration": "",
    "created_by_user": "EMP-001"
  }
}
```

---

## POST /clientbilling/creditnote/create

**Request body**
```json
{
  "bill_id": "CB/25-26/0003",
  "ccn_date": "2026-03-20",
  "reason": "Client re-measured Earth Excavation at site — 80m³ rejected",
  "items": [
    {
      "item_code": "EW-01",
      "item_name": "Earth Excavation",
      "unit": "m³",
      "rate": 400,
      "return_qty": 80
    }
  ],
  "tax_mode": "instate",
  "cgst_pct": 9,
  "sgst_pct": 9,
  "narration": "",
  "created_by_user": "EMP-001"
}
```

**Notes**
- Either `bill_id` (string) or `bill_ref` (MongoDB `_id`) must be provided
- Client and tender details are auto-filled from the original bill
- Cannot create a CCN against a `Draft` or `Rejected` bill
- `return_amount` is computed server-side (`return_qty × rate`)

---

## PATCH /clientbilling/creditnote/approve/:id

Approves the CCN. Posts a **Cr entry** to the client ledger:
- Original bill posted Dr `net_amount` (client owes Romaa)
- CCN posts Cr `net_amount` (reduces client's receivable)

No request body needed.

---

---

# Part 3 — Frontend UI Guide

## Page: Bill List

**Recommended columns**

| Column | Field | Notes |
|--------|-------|-------|
| Bill No | `bill_id` | Link to detail page |
| Bill Date | `bill_date` | Format DD/MM/YYYY |
| Tender | `tender_name` | |
| Client | `client_name` | |
| Grand Total | `grand_total` | Base amount before GST |
| Net Amount | `net_amount` | Final payable |
| Received | `amount_received` | |
| Balance Due | `balance_due` | Highlight if > 0 |
| Payment Status | `paid_status` | Badge: unpaid/partial/paid |
| Status | `status` | Badge with color |

**Filters to show:** Tender, Client, Status, Paid Status, Date range

---

## Page: Create / Edit Bill

### Section 1 — Header
- Tender ID (required, dropdown) → on select, client auto-fills
- Bill Date (date picker, default today)
- Bill ID preview → call `GET /next-id` on page load

### Section 2 — Items Table

Each row represents one BOQ item being billed.

| Column | Input type | Notes |
|--------|-----------|-------|
| Item Code | text | |
| Item Name | text | |
| Unit | text | |
| Rate (₹) | number | |
| MB Ref | text | Measurement book reference |
| Agreement Qty | number | From BOQ |
| Prev Bill Qty | number | Copy from last bill's current_qty |
| **Current Qty** | **number** | **User inputs this** |
| Current Amount | read-only | `current_qty × rate` — computed |
| Upto Date Qty | read-only | `prev + current` — computed |
| Upto Date Amount | read-only | computed |
| Excess Qty | read-only | computed, highlight in red if > 0 |
| Balance Qty | read-only | computed, highlight in green |

> Show read-only computed columns only on the detail/view page, not necessarily on the create form. On create, the user fills: `item_code`, `item_name`, `unit`, `rate`, `mb_book_ref`, `agreement_qty`, `prev_bill_qty`, `current_qty`.

### Section 3 — Deductions
Dynamic list — add/remove rows.
Each row: `description` (text) + `amount` (number)

Common presets to suggest: TDS @ 2%, Labour Cess @ 1%, Mobilization Advance Recovery

### Section 4 — Tax & Retention
- Tax Mode toggle: **Instate** (CGST + SGST) / **Other State** (IGST only)
- If instate: CGST % + SGST %
- If other state: IGST %
- Retention %

### Section 5 — Summary (read-only, live-calculated)

Display this at the bottom of the form, updating as the user types:

```
Grand Total (A)                ₹ X
CGST @ 9%                      ₹ X
SGST @ 9%                      ₹ X
Total Tax (B)                  ₹ X
Retention @ 5% (C)             ₹ X
──────────────────────────────────
Deductions
  TDS @ 2%                     ₹ X
  Advance Recovery              ₹ X
Total Deductions (D)           ₹ X
──────────────────────────────────
Net Amount  (A + B − C − D)    ₹ X
```

### CSV Upload alternative
Show a "Upload CSV" button that opens a modal. Upload the CSV file + fill in the header fields (tax %, retention %, deductions) in the same modal.

---

## Page: Bill Detail

Tabs recommended:
1. **Bill Summary** — header + financial summary
2. **Items** — full table with all computed columns (agreement → prev → current → upto date → excess/balance)
3. **Deductions** — list of deductions
4. **Payments** — `payment_refs[]` list + amount_received + balance_due
5. **Credit Notes** — list of CCNs raised against this bill (`GET /creditnote/list?bill_id=CB/25-26/0003`)

**Action buttons by status:**

| Status | Actions shown |
|--------|--------------|
| Draft | Edit, Submit, Delete |
| Submitted | Mark Checked, Reject |
| Checked | Approve, Reject |
| Approved | (finance action: link Receipt Voucher) |
| Paid | View only |
| Rejected | View only |

---

## Page: Credit Note Create

- Pre-fill `bill_id` from the bill detail page
- Show the original bill's items in a table
- User enters `return_qty` for items being credited (leave 0 for items not disputed)
- Filter out rows where `return_qty === 0` before submitting
- Show reason textarea (required)
- Show GST section (default same as original bill)
- Show net_amount preview

---

## Status badge colors (suggested)

| Status | Color |
|--------|-------|
| Draft | Gray |
| Submitted | Blue |
| Checked | Teal |
| Approved | Green |
| Paid | Green (dark) |
| Rejected | Red |

| Paid Status | Color |
|------------|-------|
| unpaid | Red |
| partial | Orange |
| paid | Green |
