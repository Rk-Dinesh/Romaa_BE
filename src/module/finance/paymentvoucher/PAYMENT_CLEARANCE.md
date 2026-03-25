# Payment Clearance — Bill Settlement Tracking

## Overview

When a Payment Voucher is **approved**, every bill listed in its `bill_refs` is
automatically updated to reflect that payment. The bill records:

- **which payment voucher** cleared it (`payment_refs` array)
- **how much has been paid** (`amount_paid`)
- **whether it is fully or partially settled** (`paid_status`)

This gives a complete payable-to-payment audit trail without any manual steps.

---

## Data Flow

```
PaymentVoucher approved
        │
        ├── postToLedger(pv)          → supplier ledger entry posted
        │
        ├── markBillsSettled(pv)
        │       │
        │       ├─ bill_type = "PurchaseBill"  →  PurchaseBillModel.findById(bill_ref)
        │       └─ bill_type = "WeeklyBilling" →  WeeklyBillingModel.findById(bill_ref)
        │               │
        │               ▼
        │       bill.payment_refs.push({ pv_ref, pv_no, paid_amt, paid_date })
        │       bill.amount_paid += settled_amt
        │       bill.paid_status  = "unpaid" | "partial" | "paid"
        │       bill.save()
        │
        └── adjustBankBalance(pv)
                │
                └─ AccountTreeModel.findOne({ account_code: pv.bank_account_code })
                        │
                        ▼
                signed = +opening_balance (Dr) OR −opening_balance (Cr)
                signed -= pv.amount            ← Cr to bank reduces Dr balance
                opening_balance_type = signed >= 0 ? "Dr" : "Cr"
                opening_balance      = Math.abs(signed)
                AccountTree.save()
```

---

## Changes Made

### 1. `purchasebill/purchasebill.model.js`

Three new fields added to `PurchaseBillSchema`:

| Field | Type | Description |
|---|---|---|
| `paid_status` | `"unpaid" \| "partial" \| "paid"` | Payment state — default `"unpaid"` |
| `amount_paid` | `Number` | Cumulative amount received via payment vouchers |
| `payment_refs` | `Array` | One entry per PV that settled this bill |

`payment_refs` entry shape:
```js
{
  pv_ref:    ObjectId  // → PaymentVoucher
  pv_no:     String    // snapshot e.g. "PV/25-26/0003"
  paid_amt:  Number    // amount settled in this PV
  paid_date: Date      // pv_date from the voucher
}
```

New index added:
```js
PurchaseBillSchema.index({ paid_status: 1, doc_date: -1 }); // unpaid/partial queue
```

---

### 2. `weeklyBilling/WeeklyBilling.model.js`

Same three fields added to `WeeklyBillingSchema` (identical structure).

`paid_status` is compared against `net_payable` (after retention deduction).

New index added:
```js
WeeklyBillingSchema.index({ paid_status: 1, bill_date: -1 }); // unpaid/partial queue
```

---

### 3. `paymentvoucher/paymentvoucher.model.js`

`bill_type` added to `BillRefSchema` so the service knows which collection to update:

```js
{
  bill_type:   "PurchaseBill" | "WeeklyBilling"   // default: "PurchaseBill"
  bill_ref:    ObjectId
  bill_no:     String
  settled_amt: Number
}
```

---

### 4. `paymentvoucher/paymentvoucher.model.js`

`bank_account_code` added to link the PV to a `CompanyBankAccount` / `AccountTree` node:

```js
bank_account_code: { type: String, default: "" }  // e.g. "1020-HDFC-001"
```

This is the `account_code` of the bank account being debited on payment.

---

### 5. `paymentvoucher/paymentvoucher.service.js`

- Imports `PurchaseBillModel`, `WeeklyBillingModel`, and `AccountTreeModel`
- Added `markBillsSettled(pv)` helper — runs after `postToLedger(pv)` on approve
- Added `adjustBankBalance(pv)` helper — runs after `markBillsSettled(pv)` on approve
- `buildDoc` maps `bill_type` and `bank_account_code` from payload
- `approve(id)` sequence: `postToLedger → markBillsSettled → adjustBankBalance`

**`adjustBankBalance` logic:**

For a Dr-normal bank account (Asset), paying out credits the bank and reduces its Dr balance:

```js
signed = obType === "Dr" ? opening_balance : -opening_balance
signed -= pv.amount    // payment out = Cr to bank
new opening_balance_type = signed >= 0 ? "Dr" : "Cr"
new opening_balance      = Math.abs(signed)
```

If no `bank_account_code` is set on the PV, the step is silently skipped.

---

## Finance Dropdown — Payable Bills API

The `/finance-dropdown/payable-bills` endpoint surfaces only bills that still have
outstanding balance (`paid_status != "paid"`) and returns `balance_due` per bill
so the frontend can pre-fill `settled_amt` when building a new PV.

```
GET /finance-dropdown/payable-bills
    ?supplier_id=VND-001          (optional)
    &supplier_type=Vendor         (optional — "Vendor" | "Contractor", omit for both)
    &tender_id=TND-001            (optional)
Authorization: Bearer <token>
```

Response includes:
```json
{
  "_id": "<ObjectId>",
  "bill_type": "PurchaseBill",
  "bill_no": "PB/25-26/0001",
  "bill_amount": 118000,
  "amount_paid": 60000,
  "balance_due": 58000,
  "paid_status": "partial"
}
```

---

## Frontend Usage

### Creating a Payment Voucher against bills

```json
POST /paymentvoucher/create
{
  "pv_no": "PV/25-26/0003",
  "pv_date": "2026-03-25",
  "supplier_type": "Vendor",
  "supplier_id": "VND-001",
  "payment_mode": "NEFT",
  "gross_amount": 118000,
  "bill_refs": [
    {
      "bill_type": "PurchaseBill",
      "bill_ref": "<ObjectId of PurchaseBill>",
      "bill_no": "PB/25-26/0001",
      "settled_amt": 118000
    }
  ],
  "entries": [
    { "dr_cr": "Dr", "account_name": "Vendor A/c", "debit_amt": 118000, "credit_amt": 0 },
    { "dr_cr": "Cr", "account_name": "HDFC Bank A/c", "debit_amt": 0, "credit_amt": 118000 }
  ],
  "narration": "Payment against PB/25-26/0001"
}
```

For a **Weekly Bill**:
```json
{
  "bill_type": "WeeklyBilling",
  "bill_ref": "<ObjectId of WeeklyBilling>",
  "bill_no": "WB/TND-001/25-26/0001",
  "settled_amt": 55000
}
```

### Approve the PV

```
PATCH /paymentvoucher/approve/:id
Authorization: Bearer <token>
```

On approval, the referenced bills are automatically updated.

### After Approval — bill response includes

```json
{
  "doc_id": "PB/25-26/0001",
  "status": "approved",
  "net_amount": 118000,
  "paid_status": "paid",
  "amount_paid": 118000,
  "payment_refs": [
    {
      "pv_ref": "<ObjectId>",
      "pv_no": "PV/25-26/0003",
      "paid_amt": 118000,
      "paid_date": "2026-03-25T00:00:00.000Z"
    }
  ]
}
```

### Partial Payment Example

If a bill of ₹1,18,000 receives two payments:

| PV | Amount | `paid_status` after |
|---|---|---|
| PV/25-26/0003 | ₹60,000 | `"partial"` |
| PV/25-26/0008 | ₹58,000 | `"paid"` |

---

## Querying Unpaid / Partial Bills

```
GET /purchasebill/list?status=approved&paid_status=unpaid
GET /purchasebill/list?status=approved&paid_status=partial
GET /purchasebill/list?vendor_id=VND-001&paid_status=unpaid
```

Use the finance dropdown API for pre-built, filtered payable-bill lists ready for PV creation:

```
GET /finance-dropdown/payable-bills?supplier_type=Vendor&tender_id=TND-001
```
