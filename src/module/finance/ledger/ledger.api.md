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
| Payment         | `Dr`       | Balance decreases (liability cleared) |
| Journal         | `Dr / Cr`  | Manual adjustment / opening balance |

**Balance rule:**
- Positive balance = outstanding payable (you owe the supplier)
- Negative balance = supplier owes you (overpayment / excess CN)

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

### Response Fields (per row)

| Field | Description |
|---|---|
| `supplier_id` | Business key (vendor_id or contractor_id) |
| `supplier_name` | Snapshot name |
| `supplier_type` | `Vendor` or `Contractor` |
| `total_credit` | Sum of all Cr entries (total liability raised) |
| `total_debit` | Sum of all Dr entries (total liability cleared) |
| `balance` | `total_credit − total_debit` — net outstanding payable |
| `last_txn_date` | Date of the most recent transaction |

> Results sorted by `balance` descending (highest outstanding first).

---

## 2. Tender Ledger (All Suppliers)

All ledger entries for a specific tender, grouped by supplier — each with their own running balance.

```
GET /ledger/tender/:tenderId
```

**Auth required:** No (dev) / `finance > ledger > read` (prod)

### Query Parameters

| Param | Type | Description |
|---|---|---|
| `supplier_id` | `string` | Filter to a specific supplier |
| `supplier_type` | `"Vendor" \| "Contractor"` | Filter by supplier type |
| `vch_type` | `string` | Filter by voucher type (see list below) |
| `from_date` | `YYYY-MM-DD` | `vch_date ≥ from_date` |
| `to_date` | `YYYY-MM-DD` | `vch_date ≤ to_date` |

**Allowed `vch_type` values:** `PurchaseBill`, `WeeklyBill`, `CreditNote`, `DebitNote`, `Payment`, `Receipt`, `Journal`

### Example Requests

```
GET /ledger/tender/TND-001
GET /ledger/tender/TND-001?supplier_type=Contractor
GET /ledger/tender/TND-001?supplier_id=CON-001&from_date=2025-04-01
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
          "vch_date":    "2026-03-10T00:00:00.000Z",
          "vch_no":      "WB/25-26/0001",
          "vch_type":    "WeeklyBill",
          "particulars": "Weekly Bill WB/25-26/0001 - Labour charges",
          "debit_amt":   0,
          "credit_amt":  50000,
          "balance":     50000
        },
        {
          "vch_date":    "2026-03-15T00:00:00.000Z",
          "vch_no":      "DN/25-26/0001",
          "vch_type":    "DebitNote",
          "particulars": "Debit Note DN/25-26/0001 - Penalty for delay",
          "debit_amt":   2500,
          "credit_amt":  0,
          "balance":     47500
        },
        {
          "vch_date":    "2026-03-20T00:00:00.000Z",
          "vch_no":      "PY/25-26/0001",
          "vch_type":    "Payment",
          "cheque_no":   "UTR123456",
          "particulars": "Payment against WB/25-26/0001",
          "debit_amt":   47500,
          "credit_amt":  0,
          "balance":     0
        }
      ]
    }
  ]
}
```

---

## 3. Supplier Balance (Single)

Current outstanding net balance for one supplier. Optionally scoped to a tender.

```
GET /ledger/balance/:supplierId
```

**Auth required:** No (dev) / `finance > ledger > read` (prod)

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

## 4. Supplier Ledger (Full Register)

Complete transaction register for one supplier with running balance on every row.

```
GET /ledger/supplier/:supplierId
```

**Auth required:** No (dev) / `finance > ledger > read` (prod)

### Query Parameters

| Param | Type | Description |
|---|---|---|
| `supplier_type` | `"Vendor" \| "Contractor"` | Filter by type |
| `tender_id` | `string` | Scope to a specific tender |
| `vch_type` | `string` | Filter by voucher type |
| `from_date` | `YYYY-MM-DD` | `vch_date ≥ from_date` |
| `to_date` | `YYYY-MM-DD` | `vch_date ≤ to_date` |

### Example Requests

```
GET /ledger/supplier/VND-002
GET /ledger/supplier/CON-001?supplier_type=Contractor&tender_id=TND-001
GET /ledger/supplier/VND-002?from_date=2025-04-01&to_date=2026-03-31
GET /ledger/supplier/VND-002?vch_type=PurchaseBill
```

### Success Response `200`

```json
{
  "status": true,
  "data": [
    {
      "_id":          "67a1b2c3d4e5f6a7b8c9d0e1",
      "supplier_id":  "VND-002",
      "supplier_name":"ABC Suppliers Pvt Ltd",
      "supplier_type":"Vendor",
      "vch_date":     "2026-03-10T00:00:00.000Z",
      "vch_no":       "PB/25-26/0001",
      "vch_type":     "PurchaseBill",
      "particulars":  "Purchase Bill PB/25-26/0001 - Cement supply",
      "tender_id":    "TND-001",
      "tender_name":  "INFRA Road Project Phase 1",
      "debit_amt":    0,
      "credit_amt":   23990,
      "balance":      23990
    },
    {
      "_id":          "67a1b2c3d4e5f6a7b8c9d0e2",
      "supplier_id":  "VND-002",
      "supplier_name":"ABC Suppliers Pvt Ltd",
      "supplier_type":"Vendor",
      "vch_date":     "2026-03-15T00:00:00.000Z",
      "vch_no":       "CN/25-26/0001",
      "vch_type":     "CreditNote",
      "particulars":  "Credit Note CN/25-26/0001 - 3 bags returned",
      "tender_id":    "TND-001",
      "tender_name":  "INFRA Road Project Phase 1",
      "debit_amt":    1416,
      "credit_amt":   0,
      "balance":      22574
    },
    {
      "_id":          "67a1b2c3d4e5f6a7b8c9d0e3",
      "supplier_id":  "VND-002",
      "supplier_name":"ABC Suppliers Pvt Ltd",
      "supplier_type":"Vendor",
      "vch_date":     "2026-03-18T00:00:00.000Z",
      "vch_no":       "DN/25-26/0001",
      "vch_type":     "DebitNote",
      "particulars":  "Debit Note DN/25-26/0001 - Penalty 5 days delay",
      "tender_id":    "TND-001",
      "tender_name":  "INFRA Road Project Phase 1",
      "debit_amt":    2500,
      "credit_amt":   0,
      "balance":      20074
    }
  ]
}
```

### `balance` field

Computed per row as a running cumulative sum — not stored in DB.
Formula: `balance[n] = balance[n-1] + credit_amt[n] − debit_amt[n]`

---

## Workflow

```
1. Open Supplier Finance tab
   GET /ledger/balance/:supplierId          → show outstanding balance card

2. Open full ledger view
   GET /ledger/supplier/:supplierId         → transaction register with running balance

3. Open Tender Finance tab
   GET /ledger/tender/:tenderId             → all suppliers for that tender

4. Finance overview page
   GET /ledger/summary?only_outstanding=true → all suppliers with pending dues
```
