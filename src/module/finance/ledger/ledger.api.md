# Ledger — API Reference

**Base URL:** `/ledger`
**Module:** `finance → ledger`
**Auth:** JWT cookie or `Authorization: Bearer <token>` (currently commented out during development)

---

## Overview

The Ledger is a **read-only, append-only transaction register** per supplier (Vendor or Contractor).
Entries are never created via HTTP — they are auto-posted internally when vouchers are approved:

| Voucher         | Entry Type | Effect on Balance     |
|-----------------|------------|-----------------------|
| Purchase Bill   | `Cr`       | Balance increases (you owe more)  |
| Weekly Bill     | `Cr`       | Balance increases (you owe more)  |
| Credit Note     | `Dr`       | Balance decreases (you owe less)  |
| Debit Note      | `Dr`       | Balance decreases (you owe less)  |
| Payment Voucher | `Dr`       | Balance decreases (liability cleared) |
| Receipt Voucher | `Dr`       | Balance decreases (advance refund) |
| Journal         | `Dr / Cr`  | Manual adjustment / opening balance |

**Balance rule:**
- Positive balance = outstanding payable (you owe the supplier)
- Negative balance = supplier owes you (overpayment / excess CN)

**Accounting standards implemented:**
- Opening Balance B/F — when `from_date` is used, row 1 is always "Opening Balance B/F" carrying forward all prior balance (standard period-report behaviour)
- Duplicate protection — `postEntry` rejects if same `vch_ref + vch_type` already exists
- `financial_year` field auto-set on every entry for fast FY-scoped reports

---

## 1. All Suppliers Outstanding Balance

Returns one summary row per supplier with their current net balance. Used for the finance overview table.

```
GET /ledger/summary
```

**Auth required:** No (dev) / `finance > ledger > read` (prod)

### Query Parameters

| Param | Type | Description |
|---|---|---|
| `supplier_type` | `"Vendor" \| "Contractor"` | Filter by supplier type |
| `only_outstanding` | `"true"` | If `true`, hides suppliers with zero balance |

### Example Requests

```
GET /ledger/summary
GET /ledger/summary?supplier_type=Vendor
GET /ledger/summary?supplier_type=Contractor&only_outstanding=true
```

### Success Response `200`

```json
{
  "status": true,
  "data": [
    {
      "supplier_id":   "VND-002",
      "supplier_name": "ABC Suppliers Pvt Ltd",
      "supplier_type": "Vendor",
      "total_credit":  47980.00,
      "total_debit":   23990.00,
      "balance":       23990.00,
      "last_txn_date": "2026-03-19T00:00:00.000Z"
    },
    {
      "supplier_id":   "CON-001",
      "supplier_name": "Sri Krishna Enterprises",
      "supplier_type": "Contractor",
      "total_credit":  577202.00,
      "total_debit":   400000.00,
      "balance":       177202.00,
      "last_txn_date": "2026-03-18T00:00:00.000Z"
    }
  ]
}
```

> Results sorted by `balance` descending (highest outstanding first).

---

## 2. Tender Ledger (All Suppliers)

All ledger entries for a specific tender, grouped by supplier — each with their own running balance.
When `from_date` is set, each supplier gets an "Opening Balance B/F" row.

```
GET /ledger/tender/:tenderId
```

### Query Parameters

| Param | Type | Description |
|---|---|---|
| `supplier_id` | `string` | Filter to a specific supplier |
| `supplier_type` | `"Vendor" \| "Contractor"` | Filter by supplier type |
| `vch_type` | `string` | Filter by voucher type |
| `from_date` | `YYYY-MM-DD` | Period start — balance before this date shown as B/F |
| `to_date` | `YYYY-MM-DD` | Period end |

**Allowed `vch_type` values:** `PurchaseBill`, `WeeklyBill`, `CreditNote`, `DebitNote`, `Payment`, `Receipt`, `Journal`

### Example Requests

```
GET /ledger/tender/TND-001
GET /ledger/tender/TND-001?supplier_type=Contractor
GET /ledger/tender/TND-001?from_date=2025-04-01&to_date=2026-03-31
```

### Success Response `200`

```json
{
  "status": true,
  "data": [
    {
      "supplier_id":   "CON-001",
      "supplier_name": "Sri Krishna Enterprises",
      "supplier_type": "Contractor",
      "entries": [
        {
          "vch_date":           "2025-04-01T00:00:00.000Z",
          "vch_no":             "",
          "vch_type":           "Journal",
          "particulars":        "Opening Balance B/F",
          "debit_amt":          0,
          "credit_amt":         10000,
          "balance":            10000,
          "is_opening_balance": true
        },
        {
          "vch_date":    "2026-03-10T00:00:00.000Z",
          "vch_no":      "WB/25-26/0001",
          "vch_type":    "WeeklyBill",
          "particulars": "Weekly Bill WB/25-26/0001 - Labour charges",
          "debit_amt":   0,
          "credit_amt":  50000,
          "balance":     60000
        },
        {
          "vch_date":    "2026-03-20T00:00:00.000Z",
          "vch_no":      "PV/25-26/0001",
          "vch_type":    "Payment",
          "particulars": "Payment Voucher PV/25-26/0001",
          "debit_amt":   47500,
          "credit_amt":  0,
          "balance":     12500
        }
      ]
    }
  ]
}
```

---

## 3. Tender Balance (Single Figure)

Single total outstanding balance for an entire tender with a breakdown by voucher type.
Useful for project managers — "how much is still owed on TND-001?"

```
GET /ledger/tender-balance/:tenderId
```

### Query Parameters

| Param | Type | Description |
|---|---|---|
| `supplier_type` | `"Vendor" \| "Contractor"` | Scope to vendor-only or contractor-only payables |

### Example Requests

```
GET /ledger/tender-balance/TND-001
GET /ledger/tender-balance/TND-001?supplier_type=Contractor
```

### Success Response `200`

```json
{
  "status": true,
  "data": {
    "total_bills":    577202.00,
    "total_cn":         1416.00,
    "total_dn":         2500.00,
    "total_payments": 400000.00,
    "total_receipts":      0.00,
    "total_credit":   577202.00,
    "total_debit":    403916.00,
    "balance":        173286.00
  }
}
```

| Field | Description |
|---|---|
| `total_bills` | Sum of all Purchase Bills + Weekly Bills (Cr side) |
| `total_cn` | Sum of all Credit Notes (Dr side) |
| `total_dn` | Sum of all Debit Notes (Dr side) |
| `total_payments` | Sum of all Payment Vouchers (Dr side) |
| `total_receipts` | Sum of all Receipt Vouchers (Dr side) |
| `balance` | Net outstanding = `total_credit − total_debit` |

---

## 4. Supplier Balance (Single)

Current outstanding net balance for one supplier. Optionally scoped to a tender.

```
GET /ledger/balance/:supplierId
```

### Query Parameters

| Param | Type | Description |
|---|---|---|
| `supplier_type` | `"Vendor" \| "Contractor"` | Helps disambiguate if needed |
| `tender_id` | `string` | Scope balance to a specific tender |

### Example Requests

```
GET /ledger/balance/VND-002
GET /ledger/balance/CON-001?supplier_type=Contractor
GET /ledger/balance/VND-002?tender_id=TND-001
```

### Success Response `200`

```json
{
  "status": true,
  "data": {
    "supplier_id":   "VND-002",
    "supplier_name": "ABC Suppliers Pvt Ltd",
    "supplier_type": "Vendor",
    "total_credit":  23990.00,
    "total_debit":   0.00,
    "balance":       23990.00
  }
}
```

> Returns zeroed object (no error) if no entries exist yet for the supplier.

---

## 5. Supplier Statement (By Voucher Type)

Payables statement broken down by voucher type — for finance reconciliation.
Shows total bills raised, CNs, DNs, payments, receipts and net balance in one call.

```
GET /ledger/statement/:supplierId
```

### Query Parameters

| Param | Type | Description |
|---|---|---|
| `supplier_type` | `"Vendor" \| "Contractor"` | Filter by type |
| `tender_id` | `string` | Scope to a specific tender |
| `financial_year` | `string` | e.g. `"25-26"` — scope to a single FY |

### Example Requests

```
GET /ledger/statement/VND-002
GET /ledger/statement/VND-002?financial_year=25-26
GET /ledger/statement/CON-001?supplier_type=Contractor&tender_id=TND-001
```

### Success Response `200`

```json
{
  "status": true,
  "data": {
    "supplier_id": "VND-002",
    "balance":     20074.00,
    "breakdown": [
      {
        "vch_type":     "CreditNote",
        "count":        1,
        "total_credit": 0,
        "total_debit":  1416.00,
        "net":         -1416.00,
        "last_date":    "2026-03-15T00:00:00.000Z"
      },
      {
        "vch_type":     "DebitNote",
        "count":        1,
        "total_credit": 0,
        "total_debit":  2500.00,
        "net":         -2500.00,
        "last_date":    "2026-03-18T00:00:00.000Z"
      },
      {
        "vch_type":     "PurchaseBill",
        "count":        1,
        "total_credit": 23990.00,
        "total_debit":  0,
        "net":          23990.00,
        "last_date":    "2026-03-10T00:00:00.000Z"
      }
    ]
  }
}
```

| Field | Description |
|---|---|
| `balance` | Overall net outstanding (all types combined) |
| `breakdown[].vch_type` | Voucher type |
| `breakdown[].count` | Number of entries of this type |
| `breakdown[].total_credit` | Sum of Cr entries for this type |
| `breakdown[].total_debit` | Sum of Dr entries for this type |
| `breakdown[].net` | `total_credit − total_debit` for this type (positive = payable raised, negative = payable cleared) |

---

## 6. Supplier Ledger (Full Register)

Complete transaction register for one supplier with running balance on every row.
When `from_date` is used, row 1 is always "Opening Balance B/F" — standard accounting practice.

```
GET /ledger/supplier/:supplierId
```

### Query Parameters

| Param | Type | Description |
|---|---|---|
| `supplier_type` | `"Vendor" \| "Contractor"` | Filter by type |
| `tender_id` | `string` | Scope to a specific tender |
| `vch_type` | `string` | Filter by voucher type |
| `from_date` | `YYYY-MM-DD` | Period start — balance before this date shown as Opening B/F row |
| `to_date` | `YYYY-MM-DD` | Period end |

### Example Requests

```
GET /ledger/supplier/VND-002
GET /ledger/supplier/CON-001?supplier_type=Contractor&tender_id=TND-001
GET /ledger/supplier/VND-002?from_date=2025-04-01&to_date=2026-03-31
GET /ledger/supplier/VND-002?vch_type=PurchaseBill
```

### Success Response `200` — with `from_date` (note B/F row)

```json
{
  "status": true,
  "data": [
    {
      "vch_date":           "2025-04-01T00:00:00.000Z",
      "vch_no":             "",
      "vch_type":           "Journal",
      "particulars":        "Opening Balance B/F",
      "debit_amt":          0,
      "credit_amt":         5000,
      "balance":            5000,
      "is_opening_balance": true
    },
    {
      "vch_date":    "2026-03-10T00:00:00.000Z",
      "vch_no":      "PB/25-26/0001",
      "vch_type":    "PurchaseBill",
      "particulars": "Purchase Bill PB/25-26/0001 - Cement supply",
      "tender_id":   "TND-001",
      "tender_name": "INFRA Road Project Phase 1",
      "debit_amt":   0,
      "credit_amt":  23990,
      "balance":     28990
    },
    {
      "vch_date":    "2026-03-15T00:00:00.000Z",
      "vch_no":      "CN/25-26/0001",
      "vch_type":    "CreditNote",
      "particulars": "Credit Note CN/25-26/0001 - 3 bags returned",
      "debit_amt":   1416,
      "credit_amt":  0,
      "balance":     27574
    }
  ]
}
```

### `balance` field

Computed per row as a running cumulative sum — not stored in DB.
Formula: `balance[n] = balance[n-1] + credit_amt[n] − debit_amt[n]`
When `from_date` is used: `balance[0]` = Opening Balance B/F, which is the sum of ALL entries before `from_date`.

---

## Workflow

```
1. Finance overview — who has outstanding dues?
   GET /ledger/summary?only_outstanding=true

2. Supplier account screen — full history
   GET /ledger/supplier/:supplierId

3. Period report (e.g. FY 2025-26) — with correct opening balance
   GET /ledger/supplier/:supplierId?from_date=2025-04-01&to_date=2026-03-31
   → Row 1 = Opening Balance B/F (balance carried from before Apr 2025)

4. Supplier reconciliation — see totals by voucher type
   GET /ledger/statement/:supplierId?financial_year=25-26

5. Before making a payment — check exact amount owed
   GET /ledger/balance/:supplierId

6. Project cost tracking — total outstanding for a tender
   GET /ledger/tender-balance/TND-001

7. Tender finance tab — all suppliers for a tender
   GET /ledger/tender/TND-001
```

---

## financial_year field

Every ledger entry carries `financial_year` (e.g. `"25-26"`) auto-set from `vch_date`.
- FY starts April 1, ends March 31
- Use `?financial_year=25-26` in `/statement` to scope reports to a single year
- Indexed for fast FY-scoped aggregations

## Duplicate Protection

`postEntry` checks for an existing `LedgerEntry` with the same `vch_ref + vch_type` before inserting.
If found, it throws: `"duplicate — ledger entry for CreditNote CN/25-26/0001 already exists"`.
This prevents double-posting from network retries or concurrent approval calls.
