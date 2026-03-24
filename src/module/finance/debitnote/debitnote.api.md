# Debit Note — API Reference

**Base URL:** `/debitnote`
**Module:** `finance → debitnote`
**Auth:** JWT cookie or `Authorization: Bearer <token>` (currently commented out during development)

---

## Overview

A Debit Note (DN) is a voucher that **reduces the outstanding payable** to a supplier by recording a claim or deduction.
Suppliers can be **Vendors** (material supply) or **Contractors** (labour/work).

**Common triggers:**
- Penalty for delayed supply or poor workmanship
- Price difference — supplier billed higher than agreed PO/WO rate
- Short supply deduction
- Quality rejection at site

On **approval**, a `Dr` ledger entry is auto-posted → reduces the supplier's balance in the ledger.

> **DN vs CN:** Both reduce payable. CN is typically initiated by the supplier (they issue it to you). DN is typically initiated by you (you raise it against the supplier). Both have the same ledger effect.

---

## 1. Get Next DN Number

Returns the `dn_no` to assign to the next debit note. Call before opening the Create form.

```
GET /debitnote/next-no
```

**Auth required:** No (dev) / `finance > debitnote > read` (prod)

### Success Response `200`

```json
{
  "status":   true,
  "dn_no":    "DN/25-26/0001",
  "is_first": true
}
```

| Field | Description |
|---|---|
| `dn_no` | Next DN number — use this in the create payload |
| `is_first` | `true` if no DNs exist yet in this financial year |

> Format: `DN/<FY>/<seq>` — FY resets every April 1. Read-only preview — does not reserve anything.

---

## 2. List Debit Notes

Filtered list of all debit notes. All query params are optional and combinable.

```
GET /debitnote/list
```

### Query Parameters

| Param | Type | Description |
|---|---|---|
| `supplier_type` | `"Vendor" \| "Contractor"` | Filter by supplier type |
| `supplier_id` | `string` | Exact match — e.g. `CON-001` |
| `tender_id` | `string` | Exact match — e.g. `TND-001` |
| `status` | `"draft" \| "pending" \| "approved"` | Lifecycle status |
| `adj_type` | `string` | `Against Bill` / `Advance Adjustment` / `On Account` |
| `tax_type` | `string` | `GST` / `NonGST` / `Exempt` |
| `dn_no` | `string` | Exact match |
| `from_date` | `YYYY-MM-DD` | `dn_date ≥ from_date` |
| `to_date` | `YYYY-MM-DD` | `dn_date ≤ to_date` |

### Example Requests

```
GET /debitnote/list
GET /debitnote/list?supplier_type=Contractor&status=pending
GET /debitnote/list?tender_id=TND-001&from_date=2025-04-01&to_date=2026-03-31
```

### Success Response `200`

```json
{
  "status": true,
  "data": [
    {
      "_id":           "67a1b2c3d4e5f6a7b8c9d0f1",
      "dn_no":         "DN/25-26/0001",
      "dn_date":       "2026-03-18T00:00:00.000Z",
      "document_year": "25-26",
      "reference_no":  "",
      "supplier_type": "Contractor",
      "supplier_id":   "CON-001",
      "supplier_name": "Sri Krishna Enterprises",
      "tender_id":     "TND-001",
      "tender_name":   "INFRA Road Project Phase 1",
      "bill_no":       "WB/25-26/0001",
      "amount":        2500,
      "service_amt":   0,
      "adj_type":      "Against Bill",
      "tax_type":      "NonGST",
      "status":        "pending",
      "narration":     "Penalty for 5-day delay @ ₹500/day",
      "createdAt":     "2026-03-18T09:00:00.000Z"
    }
  ]
}
```

---

## 3. Debit Notes by Supplier

All debit notes for a specific supplier.

```
GET /debitnote/by-supplier/:supplierId
```

### Query Parameters

| Param | Type | Description |
|---|---|---|
| `supplier_type` | `"Vendor" \| "Contractor"` | Required if same ID exists in both |
| `status` | `string` | Filter by status |
| `from_date` | `YYYY-MM-DD` | Date range start |
| `to_date` | `YYYY-MM-DD` | Date range end |

### Example Requests

```
GET /debitnote/by-supplier/CON-001
GET /debitnote/by-supplier/CON-001?supplier_type=Contractor&status=approved
GET /debitnote/by-supplier/VND-002?from_date=2025-04-01
```

---

## 4. Debit Notes by Tender

All debit notes for a specific tender.

```
GET /debitnote/by-tender/:tenderId
```

### Query Parameters

| Param | Type | Description |
|---|---|---|
| `supplier_id` | `string` | Filter to one supplier |
| `supplier_type` | `"Vendor" \| "Contractor"` | Filter by type |
| `status` | `string` | Filter by status |

### Example Requests

```
GET /debitnote/by-tender/TND-001
GET /debitnote/by-tender/TND-001?supplier_type=Contractor
GET /debitnote/by-tender/TND-001?supplier_id=CON-001&status=approved
```

---

## 5. Create Debit Note

Creates a new debit note. Supplier name, GSTIN, and ref are **auto-filled** from the master using `supplier_id` + `supplier_type`.

```
POST /debitnote/create
Content-Type: application/json
```

### Request Body

```json
{
  "dn_no":          "DN/25-26/0001",
  "dn_date":        "2026-03-18",
  "document_year":  "25-26",
  "reference_no":   "",
  "reference_date": null,
  "location":       "Mumbai",
  "sales_type":     "Local",
  "adj_type":       "Against Bill",
  "tax_type":       "NonGST",
  "rev_charge":     false,

  "supplier_type":  "Contractor",
  "supplier_id":    "CON-001",

  "tender_id":      "TND-001",
  "tender_ref":     "67a1b2c3d4e5f6a7b8c9d0e0",
  "tender_name":    "INFRA Road Project Phase 1",

  "bill_ref":       "67a1b2c3d4e5f6a7b8c9d0e5",
  "bill_no":        "WB/25-26/0001",

  "amount":         2500,
  "service_amt":    0,

  "entries": [
    { "dr_cr": "Dr", "account_name": "Sri Krishna Enterprises", "debit_amt": 2500, "credit_amt": 0 },
    { "dr_cr": "Cr", "account_name": "Penalty Recovery",        "debit_amt": 0,    "credit_amt": 2500 }
  ],

  "narration": "Penalty for 5-day delay in supply @ ₹500/day",
  "status":    "pending"
}
```

### Request Fields

#### Top-level

| Field | Type | Required | Description |
|---|---|---|---|
| `dn_no` | `string` | **Yes** | From `GET /next-no` |
| `dn_date` | `date` | No | Defaults to today |
| `document_year` | `string` | No | e.g. `"25-26"` — defaults to current FY |
| `reference_no` | `string` | No | Supplier's own DN reference (if any) |
| `reference_date` | `date` | No | Date on supplier's document |
| `location` | `string` | No | Branch / site location |
| `sales_type` | `string` | No | `Local` / `Interstate` / `Export` / `SEZ` / `Exempt` |
| `adj_type` | `string` | No | `Against Bill` / `Advance Adjustment` / `On Account` |
| `tax_type` | `string` | No | `GST` / `NonGST` / `Exempt` |
| `rev_charge` | `boolean` | No | Reverse Charge Mechanism — default `false` |
| `supplier_type` | `"Vendor" \| "Contractor"` | **Yes** | Type of supplier |
| `supplier_id` | `string` | **Yes** | Business key — used to auto-fill all supplier fields |
| `supplier_ref` | — | — | **Auto-filled** — do not send |
| `supplier_name` | — | — | **Auto-filled** from master — do not send |
| `supplier_gstin` | — | — | **Auto-filled** from master — do not send |
| `tender_id` | `string` | No | Tender business key |
| `tender_ref` | `ObjectId` | No | Tender `_id` |
| `tender_name` | `string` | No | Snapshot |
| `bill_ref` | `ObjectId` | No | Linked bill `_id` (PurchaseBill or WeeklyBill) |
| `bill_no` | `string` | No | Snapshot of bill number |
| `amount` | `number` | No | Total DN value |
| `service_amt` | `number` | No | Service portion of the amount (if applicable) |
| `narration` | `string` | No | Free text — describe the reason for deduction |
| `status` | `string` | No | `draft` / `pending` (default) — use `approved` to auto-post ledger on create |

#### `entries[]` — minimum 1 required

| Field | Type | Description |
|---|---|---|
| `dr_cr` | `"Dr" \| "Cr"` | Entry side |
| `account_name` | `string` | Ledger account head (e.g. supplier name, "Penalty Recovery") |
| `debit_amt` | `number` | Amount on debit side (0 if Cr entry) |
| `credit_amt` | `number` | Amount on credit side (0 if Dr entry) |

### Side Effects

If `status` is `"approved"` at creation (or after `PATCH /approve`):
- A `Dr` ledger entry is auto-posted to `LedgerEntry` collection
- `debit_amt = amount`, `vch_type = "DebitNote"`
- Supplier's outstanding balance is reduced by `amount`

### Success Response `201`

```json
{
  "status":  true,
  "message": "Debit note created",
  "data": {
    "dn_no":         "DN/25-26/0001",
    "dn_date":       "2026-03-18T00:00:00.000Z",
    "supplier_type": "Contractor",
    "supplier_id":   "CON-001",
    "supplier_name": "Sri Krishna Enterprises",
    "supplier_gstin":"29AABCK1234R1ZX",
    "amount":        2500,
    "service_amt":   0,
    "status":        "pending",
    "createdAt":     "2026-03-18T09:00:00.000Z"
  }
}
```

### Error Responses

| Status | Condition | Message |
|---|---|---|
| `400` | `dn_no` missing | `"dn_no is required"` |
| `400` | `supplier_id` missing | `"supplier_id is required"` |
| `400` | `supplier_type` missing | `"supplier_type is required"` |
| `400` | Vendor not found | `"Vendor 'VND-XXX' not found"` |
| `400` | Contractor not found | `"Contractor 'CON-XXX' not found"` |
| `400` | Invalid supplier_type | `"Invalid supplier_type '...'. Must be Vendor or Contractor"` |
| `400` | No entries | `"A debit note must have at least one entry line"` |
| `500` | DB / duplicate dn_no | `error.message` |

---

## 6. Approve Debit Note

Moves a `pending` debit note to `approved` and auto-posts the Dr ledger entry.

```
PATCH /debitnote/approve/:id
```

**Auth required:** No (dev) / `finance > debitnote > edit` (prod)

### Example Request

```
PATCH /debitnote/approve/67a1b2c3d4e5f6a7b8c9d0f1
```

### Success Response `200`

```json
{
  "status":  true,
  "message": "Debit note approved",
  "data": {
    "dn_no":   "DN/25-26/0001",
    "status":  "approved",
    "amount":  2500
  }
}
```

### Error Responses

| Status | Condition | Message |
|---|---|---|
| `400` | ID not found | `"Debit note not found"` |
| `400` | Already approved | `"Already approved"` |

---

## Workflow

```
1. Open Create DN form
   GET /debitnote/next-no               → pre-fill DN number

2. Select Supplier (Vendor or Contractor) + Tender + linked Bill
   → supplier_name, gstin auto-filled on create

3. Fill voucher entries (Dr/Cr lines) + amount + narration
   POST /debitnote/create               → saved as "pending"

4. Finance manager reviews and approves
   PATCH /debitnote/approve/:id         → status = "approved"
                                        → Dr ledger entry auto-posted
                                        → supplier balance reduced

5. View DNs for a supplier or tender
   GET /debitnote/by-supplier/:id
   GET /debitnote/by-tender/:tenderId
```

---

## CN vs DN — Quick Reference

| | Credit Note | Debit Note |
|---|---|---|
| **Endpoint prefix** | `/creditnote` | `/debitnote` |
| **Doc number** | `CN/25-26/XXXX` | `DN/25-26/XXXX` |
| **Initiated by** | Supplier (sends to you) | You (raise against supplier) |
| **Common reason** | Material return, overbilling | Penalty, price diff, short supply |
| **Extra field** | — | `service_amt` |
| **Ledger effect** | Dr entry — reduces payable | Dr entry — reduces payable |
