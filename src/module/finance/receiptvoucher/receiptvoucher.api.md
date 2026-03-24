# Receipt Voucher — API Reference

**Base URL:** `/receiptvoucher`
**Module:** `finance → receiptvoucher`
**Auth:** JWT cookie or `Authorization: Bearer <token>` (currently commented out during development)

---

## Overview

A Receipt Voucher (RV) records **incoming money received from a supplier** (Vendor or Contractor).
It is the reverse of a Payment Voucher — instead of you paying them, they pay you.

**Common triggers:**
- Vendor refunds an advance payment you made earlier
- Contractor returns a security deposit / retention money
- Vendor refunds an overpayment from a previous payment voucher
- Supplier returns earnest money deposit (EMD)

On **approval**, a `Dr` ledger entry is auto-posted → reduces the supplier's balance (same direction as a payment, since receiving money from them also settles the outstanding).

**Ledger effect:**
```
Dr  Bank / Cash A/c                      ₹5,000   ← money received
Cr  Supplier A/c (vendor/contractor)     ₹5,000   ← reduces advance or creates credit
```

> **RV vs PV:** Payment Voucher = you pay them. Receipt Voucher = they pay you back.

---

## 1. Get Next RV Number

Returns the `rv_no` to assign to the next receipt voucher. Call before opening the Create form.

```
GET /receiptvoucher/next-no
```

**Auth required:** No (dev) / `finance > receiptvoucher > read` (prod)

### Success Response `200`

```json
{
  "status":   true,
  "rv_no":    "RV/25-26/0001",
  "is_first": true
}
```

| Field | Description |
|---|---|
| `rv_no` | Next RV number — use this in the create payload |
| `is_first` | `true` if no RVs exist yet in this financial year |

> Format: `RV/<FY>/<seq>` — FY resets every April 1. Read-only preview — does not reserve anything.

---

## 2. List Receipt Vouchers

Filtered list of all receipt vouchers. All query params are optional and combinable.

```
GET /receiptvoucher/list
```

### Query Parameters

| Param | Type | Description |
|---|---|---|
| `supplier_type` | `"Vendor" \| "Contractor"` | Filter by supplier type |
| `supplier_id` | `string` | Exact match — e.g. `VND-002` |
| `tender_id` | `string` | Exact match — e.g. `TND-001` |
| `status` | `"draft" \| "pending" \| "approved"` | Lifecycle status |
| `receipt_mode` | `string` | `Cash` / `Cheque` / `NEFT` / `RTGS` / `UPI` / `DD` |
| `rv_no` | `string` | Exact match |
| `from_date` | `YYYY-MM-DD` | `rv_date ≥ from_date` |
| `to_date` | `YYYY-MM-DD` | `rv_date ≤ to_date` |

### Example Requests

```
GET /receiptvoucher/list
GET /receiptvoucher/list?supplier_type=Vendor&status=pending
GET /receiptvoucher/list?tender_id=TND-001&from_date=2025-04-01&to_date=2026-03-31
GET /receiptvoucher/list?receipt_mode=Cheque&status=approved
```

### Success Response `200`

```json
{
  "status": true,
  "data": [
    {
      "_id":           "67a1b2c3d4e5f6a7b8c9d0e3",
      "rv_no":         "RV/25-26/0001",
      "rv_date":       "2026-03-25T00:00:00.000Z",
      "document_year": "25-26",
      "receipt_mode":  "NEFT",
      "bank_name":     "HDFC Current A/c",
      "bank_ref":      "UTR2026032500056789",
      "supplier_type": "Vendor",
      "supplier_id":   "VND-002",
      "supplier_name": "ABC Suppliers Pvt Ltd",
      "tender_id":     "TND-001",
      "tender_name":   "INFRA Road Project Phase 1",
      "against_no":    "ADV/25-26/0001",
      "amount":        5000,
      "status":        "pending",
      "narration":     "Advance refund — excess amount returned by vendor",
      "createdAt":     "2026-03-25T10:00:00.000Z"
    }
  ]
}
```

---

## 3. Receipt Vouchers by Supplier

All receipt vouchers for a specific supplier.

```
GET /receiptvoucher/by-supplier/:supplierId
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
GET /receiptvoucher/by-supplier/VND-002
GET /receiptvoucher/by-supplier/CON-001?supplier_type=Contractor&status=approved
GET /receiptvoucher/by-supplier/VND-002?from_date=2025-04-01
```

---

## 4. Receipt Vouchers by Tender

All receipt vouchers for a specific tender.

```
GET /receiptvoucher/by-tender/:tenderId
```

### Query Parameters

| Param | Type | Description |
|---|---|---|
| `supplier_id` | `string` | Filter to one supplier |
| `supplier_type` | `"Vendor" \| "Contractor"` | Filter by type |
| `status` | `string` | Filter by status |

### Example Requests

```
GET /receiptvoucher/by-tender/TND-001
GET /receiptvoucher/by-tender/TND-001?supplier_type=Vendor
GET /receiptvoucher/by-tender/TND-001?supplier_id=CON-001&status=approved
```

---

## 5. Create Receipt Voucher

Creates a new receipt voucher. Supplier name, GSTIN, and ref are **auto-filled** from the master using `supplier_id` + `supplier_type`.

```
POST /receiptvoucher/create
Content-Type: application/json
```

### Request Body

```json
{
  "rv_no":         "RV/25-26/0001",
  "rv_date":       "2026-03-25",
  "document_year": "25-26",

  "receipt_mode":  "NEFT",
  "bank_name":     "HDFC Current A/c",
  "bank_ref":      "UTR2026032500056789",
  "cheque_no":     "",
  "cheque_date":   null,

  "supplier_type": "Vendor",
  "supplier_id":   "VND-002",

  "tender_id":     "TND-001",
  "tender_ref":    "67a1b2c3d4e5f6a7b8c9d0e0",
  "tender_name":   "INFRA Road Project Phase 1",

  "against_ref":   "67a1b2c3d4e5f6a7b8c9d0e6",
  "against_no":    "ADV/25-26/0001",

  "amount": 5000,

  "entries": [
    { "dr_cr": "Dr", "account_name": "HDFC Current A/c",      "debit_amt": 5000, "credit_amt": 0 },
    { "dr_cr": "Cr", "account_name": "ABC Suppliers Pvt Ltd", "debit_amt": 0,    "credit_amt": 5000 }
  ],

  "narration": "Advance refund — excess amount returned by vendor",
  "status":    "pending"
}
```

### Request Fields

#### Top-level

| Field | Type | Required | Description |
|---|---|---|---|
| `rv_no` | `string` | **Yes** | From `GET /next-no` |
| `rv_date` | `date` | No | Defaults to today |
| `document_year` | `string` | No | e.g. `"25-26"` — defaults to current FY |
| `receipt_mode` | `string` | No | `Cash` / `Cheque` / `NEFT` / `RTGS` / `UPI` / `DD` — default `NEFT` |
| `bank_name` | `string` | No | Name of the receiving bank account |
| `bank_ref` | `string` | No | UTR / transaction reference number |
| `cheque_no` | `string` | No | Cheque number (for `receipt_mode = Cheque`) |
| `cheque_date` | `date` | No | Cheque date (for `receipt_mode = Cheque`) |
| `supplier_type` | `"Vendor" \| "Contractor"` | **Yes** | Type of supplier paying you |
| `supplier_id` | `string` | **Yes** | Business key — used to auto-fill all supplier fields |
| `supplier_ref` | — | — | **Auto-filled** — do not send |
| `supplier_name` | — | — | **Auto-filled** from master — do not send |
| `supplier_gstin` | — | — | **Auto-filled** from master — do not send |
| `tender_id` | `string` | No | Tender business key |
| `tender_ref` | `ObjectId` | No | Tender `_id` |
| `tender_name` | `string` | No | Snapshot |
| `against_ref` | `ObjectId` | No | `_id` of source document (advance, previous PV, etc.) |
| `against_no` | `string` | No | Snapshot of the source document number |
| `amount` | `number` | No | Total receipt amount |
| `narration` | `string` | No | Free text — describe reason for receipt |
| `status` | `string` | No | `draft` / `pending` (default) — use `approved` to auto-post ledger on create |

#### `entries[]` — minimum 1 required

| Field | Type | Description |
|---|---|---|
| `dr_cr` | `"Dr" \| "Cr"` | Entry side |
| `account_name` | `string` | Ledger account head (e.g. bank account, supplier name) |
| `debit_amt` | `number` | Amount on debit side (0 if Cr entry) |
| `credit_amt` | `number` | Amount on credit side (0 if Dr entry) |

### Side Effects

If `status` is `"approved"` at creation (or after `PATCH /approve`):
- A `Dr` ledger entry is auto-posted to `LedgerEntry` collection
- `debit_amt = amount`, `vch_type = "Receipt"`
- Supplier's outstanding balance is reduced by `amount`

### Success Response `201`

```json
{
  "status":  true,
  "message": "Receipt voucher created",
  "data": {
    "rv_no":         "RV/25-26/0001",
    "rv_date":       "2026-03-25T00:00:00.000Z",
    "receipt_mode":  "NEFT",
    "bank_ref":      "UTR2026032500056789",
    "supplier_type": "Vendor",
    "supplier_id":   "VND-002",
    "supplier_name": "ABC Suppliers Pvt Ltd",
    "supplier_gstin":"27AABCU9603R1ZX",
    "amount":        5000,
    "status":        "pending",
    "createdAt":     "2026-03-25T10:00:00.000Z"
  }
}
```

### Error Responses

| Status | Condition | Message |
|---|---|---|
| `400` | `rv_no` missing | `"rv_no is required"` |
| `400` | `supplier_id` missing | `"supplier_id is required"` |
| `400` | `supplier_type` missing | `"supplier_type is required"` |
| `400` | Vendor not found | `"Vendor 'VND-XXX' not found"` |
| `400` | Contractor not found | `"Contractor 'CON-XXX' not found"` |
| `400` | Invalid supplier_type | `"Invalid supplier_type '...'. Must be Vendor or Contractor"` |
| `400` | No entries | `"A receipt voucher must have at least one entry line"` |
| `500` | DB / duplicate rv_no | `error.message` |

---

## 6. Approve Receipt Voucher

Moves a `pending` receipt voucher to `approved` and auto-posts the Dr ledger entry.

```
PATCH /receiptvoucher/approve/:id
```

**Auth required:** No (dev) / `finance > receiptvoucher > edit` (prod)

### Example Request

```
PATCH /receiptvoucher/approve/67a1b2c3d4e5f6a7b8c9d0e3
```

### Success Response `200`

```json
{
  "status":  true,
  "message": "Receipt voucher approved",
  "data": {
    "rv_no":   "RV/25-26/0001",
    "status":  "approved",
    "amount":  5000
  }
}
```

### Error Responses

| Status | Condition | Message |
|---|---|---|
| `400` | ID not found | `"Receipt voucher not found"` |
| `400` | Already approved | `"Already approved"` |

---

## Workflow

```
1. Supplier contacts you to refund advance / deposit
   Verify outstanding amount via:
   GET /ledger/balance/:supplierId          → check current balance

2. Open Create RV form
   GET /receiptvoucher/next-no              → pre-fill RV number

3. Select Supplier + Tender + against document (if applicable)
   → supplier_name, gstin auto-filled on create
   → against_ref/against_no links to source advance/PV if available

4. Enter receipt instrument details + entries + narration
   POST /receiptvoucher/create              → saved as "pending"

5. Finance manager reviews and approves
   PATCH /receiptvoucher/approve/:id        → status = "approved"
                                            → Dr ledger entry auto-posted
                                            → supplier balance adjusted

6. View receipt history
   GET /receiptvoucher/by-supplier/:id
   GET /receiptvoucher/by-tender/:tenderId
```

---

## Receipt Mode — Cheque Example

```json
{
  "rv_no":         "RV/25-26/0002",
  "rv_date":       "2026-03-28",
  "receipt_mode":  "Cheque",
  "bank_name":     "HDFC Current A/c",
  "bank_ref":      "",
  "cheque_no":     "987654",
  "cheque_date":   "2026-03-27",
  "supplier_type": "Contractor",
  "supplier_id":   "CON-001",
  "amount":        10000,
  "entries": [
    { "dr_cr": "Dr", "account_name": "HDFC Current A/c",        "debit_amt": 10000, "credit_amt": 0 },
    { "dr_cr": "Cr", "account_name": "Sri Krishna Enterprises", "debit_amt": 0,     "credit_amt": 10000 }
  ],
  "narration": "Security deposit refund — project completion TND-001",
  "status": "pending"
}
```

---

## PV vs RV — Quick Reference

| | Payment Voucher | Receipt Voucher |
|---|---|---|
| **Endpoint prefix** | `/paymentvoucher` | `/receiptvoucher` |
| **Doc number** | `PV/25-26/XXXX` | `RV/25-26/XXXX` |
| **Direction** | You pay the supplier | Supplier pays you |
| **Common use** | Settle purchase/weekly bill | Advance refund, deposit return |
| **Payment field** | `payment_mode` | `receipt_mode` |
| **Bill tracking** | `bill_refs[]` (bills settled) | `against_ref` (source document) |
| **Ledger vch_type** | `"Payment"` | `"Receipt"` |
| **Ledger effect** | `Dr` entry — reduces payable | `Dr` entry — reduces supplier balance |
