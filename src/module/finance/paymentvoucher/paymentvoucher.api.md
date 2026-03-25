# Payment Voucher — API Reference

**Base URL:** `/paymentvoucher`
**Module:** `finance → paymentvoucher`
**Auth:** JWT cookie or `Authorization: Bearer <token>`

---

## Overview

A Payment Voucher (PV) records an **outgoing payment made to a supplier** (Vendor or Contractor).
It is the final step that settles the outstanding payable balance after a Purchase Bill or Weekly Bill has been raised.

**Common triggers:**
- Settling a vendor's purchase bill (full or partial)
- Clearing a contractor's weekly billing
- On-account advance payment before a bill is raised

On **approval**, a `Dr` ledger entry is auto-posted → reduces the supplier's outstanding balance to zero (or partially).

**Ledger effect:**
```
Dr  Supplier A/c (vendor/contractor)     ₹20,074   ← liability cleared
Cr  Bank / Cash A/c                      ₹20,074
```

---

## 1. Get Next PV Number

Returns the `pv_no` to assign to the next payment voucher. Call before opening the Create form.

```
GET /paymentvoucher/next-no
```

**Auth required:** `finance > paymentvoucher > read`

### Success Response `200`

```json
{
  "status":   true,
  "pv_no":    "PV/25-26/0001",
  "is_first": true
}
```

| Field | Description |
|---|---|
| `pv_no` | Next PV number — use this in the create payload |
| `is_first` | `true` if no PVs exist yet in this financial year |

> Format: `PV/<FY>/<seq>` — FY resets every April 1. Read-only preview — does not reserve anything.

---

## 2. List Payment Vouchers

Filtered list of all payment vouchers. All query params are optional and combinable.

```
GET /paymentvoucher/list
```

### Query Parameters

| Param | Type | Description |
|---|---|---|
| `supplier_type` | `"Vendor" \| "Contractor"` | Filter by supplier type |
| `supplier_id` | `string` | Exact match — e.g. `VND-002` |
| `tender_id` | `string` | Exact match — e.g. `TND-001` |
| `status` | `"draft" \| "pending" \| "approved"` | Lifecycle status |
| `payment_mode` | `string` | `Cash` / `Cheque` / `NEFT` / `RTGS` / `UPI` / `DD` |
| `pv_no` | `string` | Exact match |
| `from_date` | `YYYY-MM-DD` | `pv_date ≥ from_date` |
| `to_date` | `YYYY-MM-DD` | `pv_date ≤ to_date` |
| `page` | `number` | Page number (1-based). Default: `1` |
| `limit` | `number` | Records per page. Default: `20` |

### Example Requests

```
GET /paymentvoucher/list
GET /paymentvoucher/list?supplier_type=Vendor&status=pending
GET /paymentvoucher/list?tender_id=TND-001&from_date=2025-04-01&to_date=2026-03-31
GET /paymentvoucher/list?payment_mode=NEFT&status=approved&page=1&limit=20
```

### Success Response `200`

```json
{
  "status": true,
  "data": [
    {
      "_id":           "67a1b2c3d4e5f6a7b8c9d0e2",
      "pv_no":         "PV/25-26/0001",
      "pv_date":       "2026-03-20T00:00:00.000Z",
      "document_year": "25-26",
      "payment_mode":  "NEFT",
      "bank_name":     "HDFC Current A/c",
      "bank_ref":      "UTR2026031900012345",
      "supplier_type": "Vendor",
      "supplier_id":   "VND-002",
      "supplier_name": "ABC Suppliers Pvt Ltd",
      "tender_id":     "TND-001",
      "tender_name":   "INFRA Road Project Phase 1",
      "bill_refs": [
        { "bill_no": "PB/25-26/0001", "settled_amt": 20074 }
      ],
      "amount":        20074,
      "status":        "pending",
      "narration":     "Net payment after CN and DN deductions",
      "createdAt":     "2026-03-20T11:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 28,
    "pages": 2
  }
}
```

---

## 3. Payment Vouchers by Supplier

All payment vouchers for a specific supplier.

```
GET /paymentvoucher/by-supplier/:supplierId
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
GET /paymentvoucher/by-supplier/VND-002
GET /paymentvoucher/by-supplier/CON-001?supplier_type=Contractor&status=approved
GET /paymentvoucher/by-supplier/VND-002?from_date=2025-04-01
```

---

## 4. Payment Vouchers by Tender

All payment vouchers for a specific tender.

```
GET /paymentvoucher/by-tender/:tenderId
```

### Query Parameters

| Param | Type | Description |
|---|---|---|
| `supplier_id` | `string` | Filter to one supplier |
| `supplier_type` | `"Vendor" \| "Contractor"` | Filter by type |
| `status` | `string` | Filter by status |

### Example Requests

```
GET /paymentvoucher/by-tender/TND-001
GET /paymentvoucher/by-tender/TND-001?supplier_type=Contractor
GET /paymentvoucher/by-tender/TND-001?supplier_id=VND-002&status=approved
```

---

## 5. Create Payment Voucher

Creates a new payment voucher. Supplier name, GSTIN, and ref are **auto-filled** from the master using `supplier_id` + `supplier_type`.

```
POST /paymentvoucher/create
Content-Type: application/json
```

### Request Body

```json
{
  "pv_no":         "PV/25-26/0001",
  "pv_date":       "2026-03-20",
  "document_year": "25-26",

  "payment_mode":  "NEFT",
  "bank_name":     "HDFC Current A/c",
  "bank_ref":      "UTR2026031900012345",
  "cheque_no":     "",
  "cheque_date":   null,

  "supplier_type": "Vendor",
  "supplier_id":   "VND-002",

  "tender_id":     "TND-001",
  "tender_ref":    "67a1b2c3d4e5f6a7b8c9d0e0",
  "tender_name":   "INFRA Road Project Phase 1",

  "bill_refs": [
    {
      "bill_ref":    "67a1b2c3d4e5f6a7b8c9d0e4",
      "bill_no":     "PB/25-26/0001",
      "settled_amt": 20074
    }
  ],

  "gross_amount": 20074,

  "entries": [
    { "dr_cr": "Dr", "account_name": "ABC Suppliers Pvt Ltd", "debit_amt": 20074, "credit_amt": 0 },
    { "dr_cr": "Cr", "account_name": "HDFC Current A/c",      "debit_amt": 0,     "credit_amt": 20074 }
  ],

  "narration": "Net payment after CN and DN deductions",
  "status":    "pending"
}
```

### Request Fields

#### Top-level

| Field | Type | Required | Description |
|---|---|---|---|
| `pv_no` | `string` | **Yes** | From `GET /next-no` |
| `pv_date` | `date` | No | Defaults to today |
| `document_year` | `string` | No | e.g. `"25-26"` — defaults to current FY |
| `payment_mode` | `string` | No | `Cash` / `Cheque` / `NEFT` / `RTGS` / `UPI` / `DD` — default `NEFT` |
| `bank_account_code` | `string` | No | Account code from AccountTree (e.g. `"1020-HDFC-001"`) — **required for approval** (can be set here or passed at approve time). Get from `GET /finance-dropdown/bank-accounts` |
| `bank_name` | `string` | No | Name of the paying bank account |
| `bank_ref` | `string` | No | UTR / transaction reference number |
| `cheque_no` | `string` | No | Cheque number (for `payment_mode = Cheque`) |
| `cheque_date` | `date` | No | Cheque date (for `payment_mode = Cheque`) |
| `supplier_type` | `"Vendor" \| "Contractor"` | **Yes** | Type of supplier |
| `supplier_id` | `string` | **Yes** | Business key — used to auto-fill all supplier fields |
| `supplier_ref` | — | — | **Auto-filled** — do not send |
| `supplier_name` | — | — | **Auto-filled** from master — do not send |
| `supplier_gstin` | — | — | **Auto-filled** from master — do not send |
| `tender_id` | `string` | No | Tender business key |
| `tender_ref` | `ObjectId` | No | Tender `_id` |
| `tender_name` | `string` | No | Snapshot |
| `bill_refs` | `array` | No | Bills being settled — leave empty for On Account payment |
| `gross_amount` | `number` | No | Gross payment before TDS. If `tds_pct > 0`, send this instead of `amount` |
| `tds_section` | `string` | No | TDS section code e.g. `194C`, `194J`, `194I` |
| `tds_pct` | `number` | No | TDS rate % e.g. `1`, `2`, `10` |
| `tds_amt` | — | — | **Server-computed** by pre-save hook — do not send |
| `amount` | — | — | **Server-computed** by pre-save hook — do not send (see TDS hook below) |
| `narration` | `string` | No | Free text note |
| `status` | `string` | No | `draft` / `pending` (default) — use `approved` to auto-post ledger on create |

> **TDS hook:** If `gross_amount > 0` and `tds_pct > 0`, then `tds_amt = gross_amount × tds_pct / 100` and `amount = gross_amount − tds_amt`. Otherwise `amount = gross_amount`. The `amount` field is always server-computed when `gross_amount` is provided — do not send it directly.

#### `bill_refs[]` — optional, one entry per bill being settled

| Field | Type | Description |
|---|---|---|
| `bill_type` | `"PurchaseBill" \| "WeeklyBilling"` | Type of bill being settled |
| `bill_ref` | `ObjectId` | `_id` of the PurchaseBill or WeeklyBill being settled |
| `bill_no` | `string` | Snapshot of bill number |
| `settled_amt` | `number` | Amount being settled from this bill |

#### `entries[]` — minimum 1 required

| Field | Type | Description |
|---|---|---|
| `dr_cr` | `"Dr" \| "Cr"` | Entry side |
| `account_name` | `string` | Ledger account head (e.g. supplier name, bank account) |
| `debit_amt` | `number` | Amount on debit side (0 if Cr entry) |
| `credit_amt` | `number` | Amount on credit side (0 if Dr entry) |

### Side Effects

If `status` is `"approved"` at creation (or after `PATCH /approve`):
- A `Dr` ledger entry is auto-posted to `LedgerEntry` collection
- `debit_amt = amount`, `vch_type = "Payment"`
- Supplier's outstanding balance is reduced by `amount`

### Success Response `201`

```json
{
  "status":  true,
  "message": "Payment voucher created",
  "data": {
    "pv_no":         "PV/25-26/0001",
    "pv_date":       "2026-03-20T00:00:00.000Z",
    "payment_mode":  "NEFT",
    "bank_ref":      "UTR2026031900012345",
    "supplier_type": "Vendor",
    "supplier_id":   "VND-002",
    "supplier_name": "ABC Suppliers Pvt Ltd",
    "supplier_gstin":"27AABCU9603R1ZX",
    "gross_amount":  20074,
    "tds_section":   null,
    "tds_pct":       0,
    "tds_amt":       0,
    "amount":        20074,
    "status":        "pending",
    "createdAt":     "2026-03-20T11:00:00.000Z"
  }
}
```

### Error Responses

| Status | Condition | Message |
|---|---|---|
| `400` | `pv_no` missing | `"pv_no is required"` |
| `400` | `supplier_id` missing | `"supplier_id is required"` |
| `400` | `supplier_type` missing | `"supplier_type is required"` |
| `400` | Vendor not found | `"Vendor 'VND-XXX' not found"` |
| `400` | Contractor not found | `"Contractor 'CON-XXX' not found"` |
| `400` | Invalid supplier_type | `"Invalid supplier_type '...'. Must be Vendor or Contractor"` |
| `400` | No entries | `"A payment voucher must have at least one entry line"` |
| `500` | DB / duplicate pv_no | `error.message` |

---

## 6. Approve Payment Voucher

Moves a `pending` payment voucher to `approved` and triggers:
1. **Ledger posting** — Dr entry to supplier ledger (clears payable)
2. **Bill settlement** — updates `payment_refs`, `amount_paid`, `paid_status` on each bill in `bill_refs`
3. **Bank balance update** — reduces bank/cash account balance via `AccountTreeService.applyBalanceLines()`

```
PATCH /paymentvoucher/approve/:id
Content-Type: application/json
```

**Auth required:** `finance > paymentvoucher > edit`

### Request Body (optional if `bank_account_code` already set on PV)

```json
{
  "bank_account_code": "1020-HDFC-001"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `bank_account_code` | `string` | **Conditional** | Required if not already set on the voucher. Links to bank/cash account for balance update. |

> If the PV already has `bank_account_code` (set at create time), the body can be `{}`. If missing from both, approval fails with `"bank_account_code is required"`.

### What happens on approval

1. PV status set to `"approved"`
2. For each `bill_refs[]` entry:
   - `payment_refs` pushed onto the bill (PurchaseBill or WeeklyBilling)
   - `amount_paid` incremented by `settled_amt`
   - `paid_status` recalculated: `unpaid` / `partial` / `paid`
3. Dr ledger entry posted to LedgerEntry (reduces supplier outstanding)
4. Bank account `opening_balance` reduced via `applyBalanceLines()` (Cr to bank)

### Example Request

```
PATCH /paymentvoucher/approve/67a1b2c3d4e5f6a7b8c9d0e2
Body: { "bank_account_code": "1020-HDFC-001" }
```

### Success Response `200`

```json
{
  "status":  true,
  "message": "Payment voucher approved",
  "data": {
    "pv_no":   "PV/25-26/0001",
    "status":  "approved",
    "amount":  20074
  }
}
```

### Error Responses

| Status | Condition | Message |
|---|---|---|
| `400` | ID not found | `"Payment voucher not found"` |
| `400` | Already approved | `"Already approved"` |
| `400` | No bank account | `"bank_account_code is required"` |

---

## 7. Get Payment Voucher by ID

```
GET /paymentvoucher/:id
```

**Auth required:** `finance > paymentvoucher > read`

Returns the full payment voucher detail.

### Success Response `200`

```json
{
  "status": true,
  "data": { ...full PV fields... }
}
```

### Error Responses

| Status | Condition | Message |
|---|---|---|
| `404` | `id` not found | `"Payment voucher not found"` |

---

## 8. Update Payment Voucher

```
PATCH /paymentvoucher/update/:id
Content-Type: application/json
```

**Auth required:** `finance > paymentvoucher > edit`

Only `draft` or `pending` PVs can be updated. Approved PVs are blocked.

**Updatable fields:** `pv_date`, `payment_mode`, `bank_name`, `bank_ref`, `cheque_no`, `cheque_date`, `tender_id`, `tender_ref`, `tender_name`, `bill_refs`, `gross_amount`, `tds_section`, `tds_pct`, `narration`

> If `entries[]` is sent, the array is replaced and balance is re-validated (Σ Dr = Σ Cr).

### Success Response `200`

```json
{
  "status": true,
  "message": "Payment voucher updated",
  "data": { ...updated PV fields... }
}
```

### Error Responses

| Status | Condition | Message |
|---|---|---|
| `400` | PV is approved | `"Cannot edit an approved payment voucher"` |
| `404` | `id` not found | `"Payment voucher not found"` |

---

## 9. Delete Payment Voucher

```
DELETE /paymentvoucher/delete/:id
```

**Auth required:** `finance > paymentvoucher > delete`

Only `draft` or `pending` PVs can be deleted. Approved PVs are blocked.

### Success Response `200`

```json
{
  "status": true,
  "message": "Payment voucher deleted",
  "data": { ...deleted PV fields... }
}
```

### Error Responses

| Status | Condition | Message |
|---|---|---|
| `400` | PV is approved | `"Cannot delete an approved payment voucher"` |
| `404` | `id` not found | `"Payment voucher not found"` |

---

## Workflow

```
1. Check supplier's current ledger balance
   GET /ledger/balance/:supplierId          → confirm outstanding amount

2. Open Create PV form
   GET /paymentvoucher/next-no              → pre-fill PV number

3. Select Supplier + Tender + bills being settled
   → supplier_name, gstin auto-filled on create
   → bill_refs[] lists which bills this payment covers

4. Enter payment instrument details (NEFT/cheque) + entries + narration
   POST /paymentvoucher/create              → saved as "pending"

5. Finance manager reviews and approves
   PATCH /paymentvoucher/approve/:id        → status = "approved"
                                            → Dr ledger entry auto-posted
                                            → supplier balance cleared

6. View payment history
   GET /paymentvoucher/by-supplier/:id
   GET /paymentvoucher/by-tender/:tenderId
```

---

## Payment Mode — Cheque Example

```json
{
  "pv_no":        "PV/25-26/0002",
  "pv_date":      "2026-03-22",
  "payment_mode": "Cheque",
  "bank_name":    "SBI OD A/c",
  "bank_ref":     "",
  "cheque_no":    "000123",
  "cheque_date":  "2026-03-22",
  "supplier_type":"Contractor",
  "supplier_id":  "CON-001",
  "gross_amount": 45000,
  "entries": [
    { "dr_cr": "Dr", "account_name": "Sri Krishna Enterprises", "debit_amt": 45000, "credit_amt": 0 },
    { "dr_cr": "Cr", "account_name": "SBI OD A/c",              "debit_amt": 0,     "credit_amt": 45000 }
  ],
  "narration": "Weekly billing settlement — WB/25-26/0002",
  "status": "pending"
}
```

---

## TDS Payment Example

```json
{
  "pv_no": "PV/25-26/0003",
  "payment_mode": "NEFT",
  "supplier_type": "Vendor",
  "supplier_id": "VND-002",
  "gross_amount": 100000,
  "tds_section": "194C",
  "tds_pct": 1,
  "entries": [
    { "dr_cr": "Dr", "account_name": "ABC Suppliers Pvt Ltd", "debit_amt": 100000, "credit_amt": 0 },
    { "dr_cr": "Cr", "account_name": "HDFC Current A/c", "debit_amt": 0, "credit_amt": 99000 },
    { "dr_cr": "Cr", "account_name": "TDS Payable (194C)", "debit_amt": 0, "credit_amt": 1000 }
  ]
}
```

> Server computes `tds_amt = 1000` (`100000 × 1 / 100`), `amount = 99000` (`100000 − 1000`) automatically. Do not send `tds_amt` or `amount` in the payload.

---

## Finance Flow Context

```
Purchase Bill (PB)     +₹23,990 Cr  ← liability created
Credit Note   (CN)     -₹1,416  Cr  ← material returned
Debit Note    (DN)     -₹2,500  Cr  ← penalty deducted
                       ─────────────
Net Payable             ₹20,074 Cr

Payment Voucher (PV)   -₹20,074 Cr  ← this document settles it
                       ─────────────
Balance                     ₹0
```
