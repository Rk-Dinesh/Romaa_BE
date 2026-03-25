# Credit Note — API Reference

**Base URL:** `/creditnote`
**Module:** `finance → creditnote`
**Auth:** JWT cookie or `Authorization: Bearer <token>`

---

## Overview

A Credit Note (CN) is a voucher that **reduces the outstanding payable** to a supplier.
Suppliers can be **Vendors** (material supply) or **Contractors** (labour/work).

**Common triggers:**
- Vendor returns excess / damaged material
- Vendor overcharged on a purchase bill
- Post-invoice discount granted by supplier
- Short supply — less delivered than billed

On **approval**, a `Dr` ledger entry is auto-posted → reduces the supplier's balance in the ledger.

---

## 1. Get Next CN Number

Returns the `cn_no` to assign to the next credit note. Call before opening the Create form.

```
GET /creditnote/next-no
```

**Auth required:** `finance > creditnote > read`

### Success Response `200`

```json
{
  "status":   true,
  "cn_no":    "CN/25-26/0001",
  "is_first": true
}
```

| Field | Description |
|---|---|
| `cn_no` | Next CN number — use this in the create payload |
| `is_first` | `true` if no CNs exist yet in this financial year |

> Format: `CN/<FY>/<seq>` — FY resets every April 1. Read-only preview — does not reserve anything.

---

## 2. List Credit Notes

Filtered list of all credit notes. All query params are optional and combinable.

```
GET /creditnote/list
```

### Query Parameters

| Param | Type | Description |
|---|---|---|
| `supplier_type` | `"Vendor" \| "Contractor"` | Filter by supplier type |
| `supplier_id` | `string` | Exact match — e.g. `VND-002` |
| `tender_id` | `string` | Exact match — e.g. `TND-001` |
| `status` | `"draft" \| "pending" \| "approved"` | Lifecycle status |
| `adj_type` | `string` | `Against Bill` / `Advance Adjustment` / `On Account` |
| `tax_type` | `string` | `GST` / `NonGST` / `Exempt` |
| `cn_no` | `string` | Exact match |
| `from_date` | `YYYY-MM-DD` | `cn_date ≥ from_date` |
| `to_date` | `YYYY-MM-DD` | `cn_date ≤ to_date` |
| `page` | `number` | Page number (1-based). Default: `1` |
| `limit` | `number` | Records per page. Default: `20` |

### Example Requests

```
GET /creditnote/list
GET /creditnote/list?supplier_type=Vendor&status=pending
GET /creditnote/list?tender_id=TND-001&from_date=2025-04-01&to_date=2026-03-31
GET /creditnote/list?page=2&limit=10
```

### Success Response `200`

```json
{
  "status": true,
  "data": [
    {
      "_id":           "67a1b2c3d4e5f6a7b8c9d0e1",
      "cn_no":         "CN/25-26/0001",
      "cn_date":       "2026-03-15T00:00:00.000Z",
      "document_year": "25-26",
      "reference_no":  "VND-CN-0042",
      "supplier_type": "Vendor",
      "supplier_id":   "VND-002",
      "supplier_name": "ABC Suppliers Pvt Ltd",
      "tender_id":     "TND-001",
      "tender_name":   "INFRA Road Project Phase 1",
      "bill_no":       "PB/25-26/0001",
      "amount":        1416,
      "adj_type":      "Against Bill",
      "tax_type":      "GST",
      "status":        "pending",
      "narration":     "3 bags cement returned — damaged",
      "createdAt":     "2026-03-15T10:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 35,
    "pages": 2
  }
}
```

---

## 3. Credit Notes by Supplier

All credit notes for a specific supplier.

```
GET /creditnote/by-supplier/:supplierId
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
GET /creditnote/by-supplier/VND-002
GET /creditnote/by-supplier/CON-001?supplier_type=Contractor&status=approved
```

---

## 4. Credit Notes by Tender

All credit notes for a specific tender.

```
GET /creditnote/by-tender/:tenderId
```

### Query Parameters

| Param | Type | Description |
|---|---|---|
| `supplier_id` | `string` | Filter to one supplier |
| `supplier_type` | `"Vendor" \| "Contractor"` | Filter by type |
| `status` | `string` | Filter by status |

### Example Requests

```
GET /creditnote/by-tender/TND-001
GET /creditnote/by-tender/TND-001?supplier_type=Vendor&status=approved
```

---

## 5. Create Credit Note

Creates a new credit note. Supplier name, GSTIN, and ref are **auto-filled** from the master using `supplier_id` + `supplier_type`.

```
POST /creditnote/create
Content-Type: application/json
```

### Request Body

```json
{
  "cn_no":          "CN/25-26/0001",
  "cn_date":        "2026-03-15",
  "document_year":  "25-26",
  "reference_no":   "VND-CN-0042",
  "reference_date": "2026-03-14",
  "location":       "Mumbai",
  "sales_type":     "Local",
  "adj_type":       "Against Bill",
  "tax_type":       "GST",
  "rev_charge":     false,

  "supplier_type":  "Vendor",
  "supplier_id":    "VND-002",

  "tender_id":      "TND-001",
  "tender_ref":     "67a1b2c3d4e5f6a7b8c9d0e0",
  "tender_name":    "INFRA Road Project Phase 1",

  "bill_ref":       "67a1b2c3d4e5f6a7b8c9d0e4",
  "bill_no":        "PB/25-26/0001",

  "taxable_amount": 1200,
  "cgst_pct":       9,
  "sgst_pct":       9,
  "igst_pct":       0,

  "entries": [
    { "dr_cr": "Dr", "account_name": "ABC Suppliers Pvt Ltd", "debit_amt": 1416, "credit_amt": 0 },
    { "dr_cr": "Cr", "account_name": "Purchase Returns",      "debit_amt": 0,    "credit_amt": 1200 },
    { "dr_cr": "Cr", "account_name": "CGST Input",            "debit_amt": 0,    "credit_amt": 108 },
    { "dr_cr": "Cr", "account_name": "SGST Input",            "debit_amt": 0,    "credit_amt": 108 }
  ],

  "narration": "3 bags cement returned — damaged on delivery",
  "status":    "pending"
}
```

### Request Fields

#### Top-level

| Field | Type | Required | Description |
|---|---|---|---|
| `cn_no` | `string` | **Yes** | From `GET /next-no` |
| `cn_date` | `date` | No | Defaults to today |
| `document_year` | `string` | No | e.g. `"25-26"` — defaults to current FY |
| `reference_no` | `string` | No | Supplier's own CN reference |
| `reference_date` | `date` | No | Date on supplier's CN document |
| `location` | `string` | No | Branch / site location |
| `sales_type` | `string` | No | `Local` / `Interstate` / `Export` / `SEZ` / `Exempt` |
| `adj_type` | `string` | No | `Against Bill` / `Advance Adjustment` / `On Account` |
| `tax_type` | `string` | No | `GST` / `NonGST` / `Exempt` |
| `rev_charge` | `boolean` | No | Reverse Charge Mechanism — default `false`. When `true`, use RCM accounts (CGST_RCM/SGST_RCM/IGST_RCM codes 2160/2170/2180) in the entries lines |
| `supplier_type` | `"Vendor" \| "Contractor"` | **Yes** | Type of supplier |
| `supplier_id` | `string` | **Yes** | Business key — used to auto-fill all supplier fields |
| `supplier_ref` | — | — | **Auto-filled** — do not send |
| `supplier_name` | — | — | **Auto-filled** from master — do not send |
| `supplier_gstin` | — | — | **Auto-filled** from master — do not send |
| `tender_id` | `string` | No | Tender business key |
| `tender_ref` | `ObjectId` | No | Tender `_id` |
| `tender_name` | `string` | No | Snapshot |
| `bill_ref` | `ObjectId` | No | Linked PurchaseBill `_id` |
| `bill_no` | `string` | No | Snapshot of bill doc_id |
| `taxable_amount` | `number` | No | Base amount before GST. Defaults to `amount` for backward compatibility |
| `cgst_pct` | `number` | No | CGST rate % |
| `sgst_pct` | `number` | No | SGST rate % |
| `igst_pct` | `number` | No | IGST rate % |
| `cgst_amt` | — | — | **Server-computed** by pre-save hook — do not send |
| `sgst_amt` | — | — | **Server-computed** by pre-save hook — do not send |
| `igst_amt` | — | — | **Server-computed** by pre-save hook — do not send |
| `total_tax` | — | — | **Server-computed** by pre-save hook — do not send |
| `amount` | `number` | No | **Auto-set by hook** to `taxable_amount + total_tax`. Can be sent directly if not using tax breakup fields |
| `narration` | `string` | No | Free text note |
| `status` | `string` | No | `draft` / `pending` (default) — use `approved` to auto-post ledger on create |

> **Tax hook:** Server computes `cgst_amt = taxable_amount × cgst_pct / 100`, `sgst_amt = taxable_amount × sgst_pct / 100`, `igst_amt = taxable_amount × igst_pct / 100`, `total_tax = cgst_amt + sgst_amt + igst_amt`, and `amount = taxable_amount + total_tax`.

#### `entries[]` — minimum 1 required

| Field | Type | Description |
|---|---|---|
| `dr_cr` | `"Dr" \| "Cr"` | Entry side |
| `account_name` | `string` | Ledger account head |
| `debit_amt` | `number` | Amount on debit side (0 if Cr entry) |
| `credit_amt` | `number` | Amount on credit side (0 if Dr entry) |

### Side Effects

If `status` is `"approved"` at creation (or after `PATCH /approve`):
- A `Dr` ledger entry is auto-posted to `LedgerEntry` collection
- `debit_amt = amount`, `vch_type = "CreditNote"`
- Supplier's outstanding balance is reduced by `amount`

### Success Response `201`

```json
{
  "status":  true,
  "message": "Credit note created",
  "data": {
    "cn_no":         "CN/25-26/0001",
    "cn_date":       "2026-03-15T00:00:00.000Z",
    "supplier_type": "Vendor",
    "supplier_id":   "VND-002",
    "supplier_name": "ABC Suppliers Pvt Ltd",
    "supplier_gstin":"27AABCU9603R1ZX",
    "taxable_amount": 1200,
    "cgst_pct": 9, "cgst_amt": 108,
    "sgst_pct": 9, "sgst_amt": 108,
    "igst_pct": 0, "igst_amt": 0,
    "total_tax": 216,
    "amount":        1416,
    "status":        "pending",
    "createdAt":     "2026-03-15T10:00:00.000Z"
  }
}
```

### Error Responses

| Status | Condition | Message |
|---|---|---|
| `400` | `cn_no` missing | `"cn_no is required"` |
| `400` | `supplier_id` missing | `"supplier_id is required"` |
| `400` | `supplier_type` missing | `"supplier_type is required"` |
| `400` | Vendor not found | `"Vendor 'VND-XXX' not found"` |
| `400` | Contractor not found | `"Contractor 'CON-XXX' not found"` |
| `400` | Invalid supplier_type | `"Invalid supplier_type '...'. Must be Vendor or Contractor"` |
| `400` | No entries | `"A credit note must have at least one entry line"` |
| `500` | DB / duplicate cn_no | `error.message` |

---

## 6. Approve Credit Note

Moves a `pending` credit note to `approved` and auto-posts the Dr ledger entry.

```
PATCH /creditnote/approve/:id
```

**Auth required:** `finance > creditnote > edit`

### Example Request

```
PATCH /creditnote/approve/67a1b2c3d4e5f6a7b8c9d0e1
```

### Success Response `200`

```json
{
  "status":  true,
  "message": "Credit note approved",
  "data": {
    "cn_no":   "CN/25-26/0001",
    "status":  "approved",
    "amount":  1416
  }
}
```

### Error Responses

| Status | Condition | Message |
|---|---|---|
| `400` | ID not found | `"Credit note not found"` |
| `400` | Already approved | `"Already approved"` |

---

## 7. Get Credit Note by ID

```
GET /creditnote/:id
```

**Auth required:** `finance > creditnote > read`

Returns the full credit note detail.

### Success Response `200`

```json
{
  "status": true,
  "data": { ...full CN fields... }
}
```

### Error Responses

| Status | Condition | Message |
|---|---|---|
| `404` | `id` not found | `"Credit note not found"` |

---

## 8. Update Credit Note

```
PATCH /creditnote/update/:id
Content-Type: application/json
```

**Auth required:** `finance > creditnote > edit`

Only `draft` or `pending` CNs can be updated. Approved CNs are blocked.

**Updatable top-level fields:** `cn_date`, `reference_no`, `reference_date`, `location`, `sales_type`, `adj_type`, `tax_type`, `rev_charge`, `tender_id`, `tender_ref`, `tender_name`, `bill_ref`, `bill_no`, `amount`, `taxable_amount`, `cgst_pct`, `sgst_pct`, `igst_pct`, `narration`

> If `entries[]` is sent, the **entire entries array is replaced** and balance is re-validated (Σ Dr = Σ Cr).

### Success Response `200`

```json
{
  "status": true,
  "message": "Credit note updated",
  "data": { ...updated CN fields... }
}
```

### Error Responses

| Status | Condition | Message |
|---|---|---|
| `400` | CN is approved | `"Cannot edit an approved credit note"` |
| `404` | `id` not found | `"Credit note not found"` |

---

## 9. Delete Credit Note

```
DELETE /creditnote/delete/:id
```

**Auth required:** `finance > creditnote > delete`

Only `draft` or `pending` CNs can be deleted. Approved CNs are blocked.

### Success Response `200`

```json
{
  "status": true,
  "message": "Credit note deleted",
  "data": { ...deleted CN fields... }
}
```

### Error Responses

| Status | Condition | Message |
|---|---|---|
| `400` | CN is approved | `"Cannot delete an approved credit note"` |
| `404` | `id` not found | `"Credit note not found"` |

---

## Workflow

```
1. Open Create CN form
   GET /creditnote/next-no              → pre-fill CN number

2. Select Supplier (Vendor or Contractor) + Tender + linked Bill
   → supplier_name, gstin auto-filled on create

3. Fill taxable_amount + GST percentages + voucher entries (Dr/Cr lines) + narration
   POST /creditnote/create              → saved as "pending"
                                        → server computes cgst_amt, sgst_amt, igst_amt, total_tax, amount

4. Finance manager reviews and approves
   PATCH /creditnote/approve/:id        → status = "approved"
                                        → Dr ledger entry auto-posted
                                        → supplier balance reduced

5. View CNs for a supplier or tender
   GET /creditnote/by-supplier/:id
   GET /creditnote/by-tender/:tenderId
```
