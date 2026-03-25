# Finance Dropdown APIs

Three read-only endpoints that power the dropdowns on Payment Voucher,
Credit Note, Debit Note, and Receipt Voucher forms.

Base prefix: `/finance-dropdown`

---

## 1. Company Bank + Cash Accounts with Balance

```
GET /finance-dropdown/bank-accounts
GET /finance-dropdown/bank-accounts?type=bank     ← bank only
GET /finance-dropdown/bank-accounts?type=cash     ← cash only
Authorization: Bearer <token>
```

Returns all active **bank accounts** (from `CompanyBankAccount`) and **cash accounts**
(from `CompanyCashAccount`) with their live `current_balance` from AccountTree.

Use `account_category` to distinguish between bank and cash entries.

### Response `200`

```json
{
  "status": true,
  "count": 2,
  "data": [
    {
      "_id": "...",
      "account_category": "bank",
      "account_code": "1020-HDFC-001",
      "account_name": "HDFC Current A/c",
      "bank_name": "HDFC Bank",
      "branch_name": "Anna Nagar Branch",
      "account_number": "XXXX1234",
      "ifsc_code": "HDFC0001234",
      "account_type": "Current",
      "credit_limit": 500000,
      "custodian_name": "",
      "location": "",
      "cash_limit": 0,
      "opening_balance": 490000,
      "opening_balance_type": "Dr",
      "current_balance": 490000
    },
    {
      "_id": "...",
      "account_category": "cash",
      "account_code": "1010-PETTY-001",
      "account_name": "Head Office Petty Cash",
      "bank_name": "",
      "branch_name": "",
      "account_number": "",
      "ifsc_code": "",
      "account_type": "Cash",
      "credit_limit": 0,
      "custodian_name": "Raj Kumar",
      "location": "Head Office",
      "cash_limit": 50000,
      "opening_balance": 25000,
      "opening_balance_type": "Dr",
      "current_balance": 25000
    }
  ]
}
```

**Used on:** Payment Voucher / Receipt Voucher → "Bank / Cash Account" selector

**Key fields:**

| Field | Description |
|---|---|
| `account_category` | `"bank"` or `"cash"` — use to render differently in the dropdown |
| `account_code` | Store as `bank_account_code` on PV/RV — used for balance updates |
| `current_balance` | Live running balance from `AccountTree.opening_balance` |
| `custodian_name` | Cash only — person managing the cash |
| `location` | Cash only — physical location |

**Balance logic:**
- `opening_balance` on AccountTree is a **live running balance** updated by `AccountTreeService.applyBalanceLines()` on every PV / RV / JE approval
- `current_balance` = `opening_balance` (Dr positive, Cr negative)
- No separate JE aggregation (avoids double-counting)

---

## 2. Payable Bills (for Payment Voucher settlement)

```
GET /finance-dropdown/payable-bills
    ?supplier_id=VND-001          (optional)
    &supplier_type=Vendor         (optional — "Vendor" | "Contractor", omit for both)
    &tender_id=TND-001            (optional)
Authorization: Bearer <token>
```

Returns all **approved, unpaid / partially-paid** bills from both
`PurchaseBill` (vendor) and `WeeklyBilling` (contractor) combined.

Sorted: overdue first (due_date ASC), then by bill_date ASC, nulls last.

### Response `200`

```json
{
  "status": true,
  "count": 2,
  "data": [
    {
      "_id": "<ObjectId>",
      "bill_type": "PurchaseBill",
      "bill_no": "PB/25-26/0001",
      "bill_date": "2026-01-10T00:00:00.000Z",
      "ref_no": "INV-2026-001",
      "due_date": "2026-02-10T00:00:00.000Z",
      "supplier_type": "Vendor",
      "supplier_id": "VND-001",
      "supplier_name": "ABC Materials Pvt Ltd",
      "tender_id": "TND-001",
      "tender_name": "Road Construction Phase 1",
      "bill_amount": 118000.00,
      "amount_paid": 60000.00,
      "balance_due": 58000.00,
      "paid_status": "partial"
    },
    {
      "_id": "<ObjectId>",
      "bill_type": "WeeklyBilling",
      "bill_no": "WB/TND-001/25-26/0003",
      "bill_date": "2026-03-01T00:00:00.000Z",
      "ref_no": "2026-02-23 – 2026-03-01",
      "due_date": null,
      "supplier_type": "Contractor",
      "supplier_id": "CTR-005",
      "supplier_name": "XYZ Contractors",
      "tender_id": "TND-001",
      "tender_name": "",
      "bill_amount": 55000.00,
      "amount_paid": 0,
      "balance_due": 55000.00,
      "paid_status": "unpaid"
    }
  ]
}
```

**Used on:** Payment Voucher → "Bills being settled" table.
Pass each selected row's `_id` and `bill_type` as `bill_refs` when creating the PV.

### `bill_refs` mapping for PV create

```json
"bill_refs": [
  {
    "bill_type":   "PurchaseBill",
    "bill_ref":    "<_id from response>",
    "bill_no":     "PB/25-26/0001",
    "settled_amt": 58000
  }
]
```

> `balance_due` is the recommended value to pre-fill `settled_amt` — it reflects any prior partial payments already made against the bill.

---

## 3. Vendors / Contractors / Client by Tender

```
GET /finance-dropdown/parties/:tenderId
    ?type=vendor               (optional — "vendor" | "contractor" | "client")
Authorization: Bearer <token>
```

Returns the parties linked to a tender:
- **vendor** → from `VendorPermitted` collection → enriched from `Vendors`
- **contractor** → `Contractors.assigned_projects.tender_id` (mirrors `/contractor/getbytender/:tenderId`)
- **client** → from `Tenders.client_id` → enriched from `Clients`

Omit `type` to get all three groups in one call.

### Response `200`

```json
{
  "status": true,
  "count": 3,
  "data": [
    {
      "party_type":     "Vendor",
      "supplier_type":  "Vendor",
      "id":             "VND-001",
      "name":           "ABC Materials Pvt Ltd",
      "gstin":          "33AABCA1234C1Z5",
      "contact_phone":  "9876543210",
      "contact_email":  "abc@materials.com",
      "sub_type":       "Material",
      "place_of_supply":"InState"
    },
    {
      "party_type":     "Contractor",
      "supplier_type":  "Contractor",
      "id":             "CTR-005",
      "name":           "XYZ Contractors",
      "gstin":          "33XYZCO1234D1Z2",
      "contact_phone":  "9123456789",
      "contact_email":  "xyz@contractors.com",
      "sub_type":       "Civil",
      "place_of_supply":"InState"
    },
    {
      "party_type":     "Client",
      "supplier_type":  "Client",
      "id":             "CLT-001",
      "name":           "State PWD Department",
      "gstin":          "",
      "contact_phone":  "",
      "contact_email":  "",
      "sub_type":       "",
      "place_of_supply":"InState"
    }
  ]
}
```

**Used on:**
- Payment Voucher → "Supplier being paid" selector
- Credit Note / Debit Note → "Supplier" selector
- Receipt Voucher → "Source supplier" selector

### Filter by type

| URL | Returns |
|-----|---------|
| `/finance-dropdown/parties/TND-001` | vendors + contractors + client |
| `/finance-dropdown/parties/TND-001?type=vendor` | vendors only |
| `/finance-dropdown/parties/TND-001?type=contractor` | contractors only |
| `/finance-dropdown/parties/TND-001?type=client` | client only |

---

## Source Collections

| API | Primary source | Enriched from |
|-----|---------------|---------------|
| Bank accounts | `CompanyBankAccount` | `AccountTree` (live running balance) |
| Cash accounts | `CompanyCashAccount` | `AccountTree` (live running balance) |
| Payable bills | `PurchaseBill` + `WeeklyBilling` | — |
| Vendors | `VendorPermitted.listOfPermittedVendors` | `Vendors` |
| Contractors | `Contractors.assigned_projects.tender_id` (same as `/contractor/getbytender/:tenderId`) | — |
| Client | `Tenders.client_id` | `Clients` |
