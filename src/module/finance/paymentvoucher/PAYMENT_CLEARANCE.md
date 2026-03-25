# Payment Clearance — Bill Settlement & Bank Balance Tracking

## Overview

When a Payment Voucher is **approved**, three things happen automatically:

1. **Bill settlement** — every bill in `bill_refs` is marked as paid/partial
2. **Supplier ledger** — a Dr entry is posted to the supplier ledger
3. **Bank balance** — the paying bank account's `opening_balance` in AccountTree is reduced

The same applies in reverse for Receipt Vouchers (bank balance increases).

---

## Data Flow — Payment Voucher Approval

```
PATCH /paymentvoucher/approve/:id
Body: { "bank_account_code": "1020-HDFC-001" }   ← REQUIRED
        │
        ├── Validate bank_account_code (BEFORE saving status)
        │
        ├── pv.status = "approved"  → pv.save()
        │
        ├── postToLedger(pv)          → supplier ledger entry posted
        │
        ├── markBillsSettled(pv)
        │       │
        │       ├─ bill_type = "PurchaseBill"  →  update PurchaseBill
        │       └─ bill_type = "WeeklyBilling" →  update WeeklyBilling
        │               │
        │               ▼
        │       bill.payment_refs.push({ pv_ref, pv_no, paid_amt, paid_date })
        │       bill.amount_paid += settled_amt
        │       bill.paid_status  = "unpaid" | "partial" | "paid"
        │
        └── AccountTreeService.applyBalanceLines()
                │
                └─ AccountTree for bank_account_code
                        │
                        ▼
                signed = +opening_balance (Dr) OR −opening_balance (Cr)
                signed -= pv.amount            ← Cr to bank reduces Dr balance
                opening_balance      = |signed|
                opening_balance_type = signed >= 0 ? "Dr" : "Cr"
```

---

## Data Flow — Receipt Voucher Approval

```
PATCH /receiptvoucher/approve/:id
Body: { "bank_account_code": "1020-HDFC-001" }   ← REQUIRED
        │
        ├── Validate bank_account_code (BEFORE saving status)
        │
        ├── rv.status = "approved"  → rv.save()
        │
        ├── postToLedger(rv)          → supplier ledger entry posted
        │
        └── AccountTreeService.applyBalanceLines()
                │
                └─ signed += rv.amount   ← Dr to bank increases Dr balance
```

---

## IMPORTANT — `bank_account_code` is Required

`bank_account_code` links the voucher to the bank account in AccountTree.
Without it, the bank balance cannot be updated.

### How to pass it

**Option A — Set it when creating the voucher:**

```json
POST /paymentvoucher/create
{
  "bank_account_code": "1020-HDFC-001",
  "bank_name": "HDFC Current A/c",
  ...
}
```

**Option B — Pass it at approval time (for existing vouchers):**

```json
PATCH /paymentvoucher/approve/:id
{
  "bank_account_code": "1020-HDFC-001"
}
```

If the voucher already has `bank_account_code`, the body is optional.
If it's missing from both the voucher AND the body, approval will fail with:
```
"bank_account_code is required — pass it in the approve request body or set it on the voucher first"
```

### Where to get the `bank_account_code`

From the bank accounts dropdown:
```
GET /finance-dropdown/bank-accounts
```
Use the `account_code` field from the response (e.g. `"1020-HDFC-001"`).

---

## Frontend Integration Guide

### Step 1 — Load bank accounts for the bank selector

```
GET /finance-dropdown/bank-accounts
Authorization: Bearer <token>
```

Response:
```json
{
  "status": true,
  "data": [
    {
      "account_code": "1020-HDFC-001",
      "account_name": "HDFC Current A/c",
      "bank_name": "HDFC Bank",
      "branch_name": "Anna Nagar Branch",
      "current_balance": 490000,
      "opening_balance": 490000,
      "opening_balance_type": "Dr"
    }
  ]
}
```

Show `account_name`, `bank_name`, `branch_name`, and `current_balance` in the dropdown.
Store the selected `account_code` as `bank_account_code`.

### Step 2 — Load payable bills (for PV only)

```
GET /finance-dropdown/payable-bills?supplier_id=VND-001&tender_id=TND-001
```

Pre-fill `settled_amt` with `balance_due` from each row.

### Step 3 — Create the Payment Voucher

```json
POST /paymentvoucher/create
{
  "pv_no": "PV/25-26/0003",
  "pv_date": "2026-03-25",
  "bank_account_code": "1020-HDFC-001",
  "bank_name": "HDFC Current A/c",
  "payment_mode": "NEFT",
  "supplier_type": "Vendor",
  "supplier_id": "VND-001",
  "gross_amount": 10000,
  "bill_refs": [
    {
      "bill_type": "PurchaseBill",
      "bill_ref": "<ObjectId>",
      "bill_no": "PB/25-26/0001",
      "settled_amt": 10000
    }
  ],
  "entries": [
    { "dr_cr": "Dr", "account_name": "Vendor A/c", "debit_amt": 10000, "credit_amt": 0 },
    { "dr_cr": "Cr", "account_name": "HDFC Bank A/c", "debit_amt": 0, "credit_amt": 10000 }
  ],
  "narration": "Payment against PB/25-26/0001"
}
```

### Step 4 — Approve

```json
PATCH /paymentvoucher/approve/:id
{
  "bank_account_code": "1020-HDFC-001"
}
```

> If `bank_account_code` was already set at create time, the body can be `{}`.

**After approval:**
- Bank balance dropdown will show `490000` instead of `500000`
- Bill `paid_status` will update to `"partial"` or `"paid"`

### Step 5 — Create a Receipt Voucher (money in)

```json
POST /receiptvoucher/create
{
  "rv_no": "RV/25-26/0001",
  "rv_date": "2026-03-25",
  "bank_account_code": "1020-HDFC-001",
  "bank_name": "HDFC Current A/c",
  "receipt_mode": "NEFT",
  "supplier_type": "Vendor",
  "supplier_id": "VND-001",
  "amount": 100000,
  "entries": [
    { "dr_cr": "Dr", "account_name": "HDFC Bank A/c", "debit_amt": 100000, "credit_amt": 0 },
    { "dr_cr": "Cr", "account_name": "Vendor A/c", "debit_amt": 0, "credit_amt": 100000 }
  ],
  "narration": "Advance refund from vendor"
}
```

Approve:
```json
PATCH /receiptvoucher/approve/:id
{
  "bank_account_code": "1020-HDFC-001"
}
```

**After approval:** Bank balance increases by `100000`.

---

## Balance Update Logic — `AccountTreeService.applyBalanceLines()`

This shared function is called by **all** finance approvals:

| Module | Direction | Effect on bank Dr balance |
|---|---|---|
| PaymentVoucher | Cr to bank | **Decreases** (payment out) |
| ReceiptVoucher | Dr to bank | **Increases** (receipt in) |
| JournalEntry | Per line | Dr increases, Cr decreases |

Formula:
```
signed_balance = opening_balance_type === "Dr" ? +opening_balance : -opening_balance
signed_balance += (debit_amt - credit_amt)
new opening_balance_type = signed_balance >= 0 ? "Dr" : "Cr"
new opening_balance      = Math.abs(signed_balance)
```

The dropdown reads `opening_balance` directly — no separate JE aggregation.

---

## Changes Made

### Models

| Model | New Fields |
|---|---|
| `PurchaseBill` | `paid_status`, `amount_paid`, `payment_refs[]` |
| `WeeklyBilling` | `paid_status`, `amount_paid`, `payment_refs[]` |
| `PaymentVoucher` | `bank_account_code`, `bill_type` on BillRefSchema |
| `ReceiptVoucher` | `bank_account_code` |

### Services

| Service | Changes |
|---|---|
| `AccountTreeService` | New `applyBalanceLines(lines)` — shared Dr/Cr balance update |
| `PaymentVoucherService` | `approve(id, body)` accepts `bank_account_code` in body; calls `applyBalanceLines` |
| `ReceiptVoucherService` | `approve(id, body)` accepts `bank_account_code` in body; calls `applyBalanceLines` |
| `JournalEntryService` | `approve()`, `reverse()`, `create()` all call `applyBalanceLines(je.lines)` |
| `DropdownService` | `getBankAccounts()` reads `opening_balance` directly (no JE aggregation) |

---

## Querying Unpaid / Partial Bills

```
GET /finance-dropdown/payable-bills?supplier_type=Vendor&tender_id=TND-001
GET /purchasebill/list?status=approved&paid_status=unpaid
GET /purchasebill/list?status=approved&paid_status=partial
```

## Partial Payment Example

Bank starts at ₹5,00,000. Bill of ₹1,18,000:

| Action | Bank Balance | Bill `paid_status` |
|---|---|---|
| PV ₹60,000 approved | ₹4,40,000 | `"partial"` |
| PV ₹58,000 approved | ₹3,82,000 | `"paid"` |
| RV ₹1,00,000 approved | ₹4,82,000 | — |
