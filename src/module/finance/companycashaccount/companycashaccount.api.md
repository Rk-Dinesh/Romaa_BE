# Company Cash Account — API Reference & Frontend Integration

**Base URL:** `/companycashaccount`
**Auth:** JWT cookie or `Authorization: Bearer <token>`

---

## Overview

Company Cash Accounts track physical cash holdings (petty cash boxes, site cash, etc.).
Each cash account is linked to an **AccountTree** leaf under parent `1010` (Cash / Petty Cash)
with `is_bank_cash = true`, mirroring how `CompanyBankAccount` works under `1020`.

### How it connects

```
AccountTree
  └── 1010 Cash / Petty Cash (group)
        ├── 1010-PETTY-001  →  CompanyCashAccount "Head Office Petty Cash"
        ├── 1010-SITE-001   →  CompanyCashAccount "Site #3 Cash Box"
        └── 1010-SITE-002   →  CompanyCashAccount "Site #7 Cash Box"
```

When a cash account is created, the service automatically:
1. Converts `1010` from leaf to group (if not already)
2. Creates the AccountTree leaf under `1010`
3. Creates the CompanyCashAccount record

### Balance tracking

Cash account balances use the same `AccountTree.opening_balance` live-update system
as bank accounts. When a PV/RV/JE is approved with a cash `account_code`:

- **Payment Voucher** (cash out): `opening_balance` decreases
- **Receipt Voucher** (cash in): `opening_balance` increases
- **Journal Entry**: per-line Dr/Cr applied to `opening_balance`

The dropdown API `GET /finance-dropdown/bank-accounts` returns both bank AND cash accounts
with `account_category: "bank"` or `"cash"` to distinguish them.

---

## Endpoints

### 1. List All Cash Accounts

```
GET /companycashaccount/list
Authorization: Bearer <token>
```

Returns all active (non-deleted) cash accounts sorted by name.

#### Response `200`

```json
{
  "status": true,
  "data": [
    {
      "_id": "...",
      "account_code": "1010-PETTY-001",
      "account_name": "Head Office Petty Cash",
      "custodian_name": "Raj Kumar",
      "location": "Head Office",
      "cash_limit": 50000,
      "is_active": true,
      "created_by": "EMP-001"
    }
  ]
}
```

---

### 2. Get by ID

```
GET /companycashaccount/:id
Authorization: Bearer <token>
```

#### Response `200`

```json
{
  "status": true,
  "data": { ... }
}
```

#### Response `404`

```json
{ "status": false, "message": "Company cash account not found" }
```

---

### 3. Get by Account Code

```
GET /companycashaccount/by-code/1010-PETTY-001
Authorization: Bearer <token>
```

---

### 4. Create Cash Account

```
POST /companycashaccount/create
Authorization: Bearer <token>
Content-Type: application/json
```

#### Request Body

```json
{
  "account_code": "1010-PETTY-001",
  "account_name": "Head Office Petty Cash",
  "custodian_name": "Raj Kumar",
  "location": "Head Office",
  "cash_limit": 50000
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `account_code` | String | Yes | Unique code — must start with `1010-` by convention |
| `account_name` | String | Yes | Display name for the cash account |
| `custodian_name` | String | No | Person responsible for the cash |
| `location` | String | No | Physical location (head office, site, etc.) |
| `cash_limit` | Number | No | Maximum cash allowed on hand (default 0) |

#### What happens on create

1. `1010` AccountTree node is converted to a group (if still a leaf from seed)
2. New AccountTree leaf created: `account_code`, `parent_code: "1010"`, `is_bank_cash: true`
3. CompanyCashAccount record saved

#### Response `201`

```json
{
  "status": true,
  "message": "Company cash account created",
  "data": { ... }
}
```

#### Response `400`

```json
{ "status": false, "message": "account_code is required" }
{ "status": false, "message": "Company cash account '1010-PETTY-001' already exists" }
```

---

### 5. Update Cash Account

```
PATCH /companycashaccount/update/:id
Authorization: Bearer <token>
Content-Type: application/json
```

#### Request Body (all optional)

```json
{
  "account_name": "Main Office Petty Cash",
  "custodian_name": "Sita Devi",
  "location": "Main Office - Ground Floor",
  "cash_limit": 75000,
  "is_active": true
}
```

Name changes are synced to AccountTree automatically.

---

### 6. Delete Cash Account (Soft Delete)

```
DELETE /companycashaccount/delete/:id
Authorization: Bearer <token>
```

Sets `is_deleted: true` and deactivates the linked AccountTree leaf.

---

## Finance Dropdown — Bank + Cash Combined

```
GET /finance-dropdown/bank-accounts
GET /finance-dropdown/bank-accounts?type=bank     ← bank only
GET /finance-dropdown/bank-accounts?type=cash     ← cash only
Authorization: Bearer <token>
```

Returns both bank and cash accounts with live balances. Use `account_category` to distinguish.

### Response `200`

```json
{
  "status": true,
  "count": 3,
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

### Frontend: Rendering the dropdown

| `account_category` | Show |
|---|---|
| `"bank"` | `account_name` + `bank_name` + `branch_name` + `current_balance` |
| `"cash"` | `account_name` + `location` + `current_balance` |

Store the selected `account_code` as `bank_account_code` on PV/RV.

---

## Using Cash Accounts in Payment / Receipt Vouchers

### Cash Payment (PV)

```json
POST /paymentvoucher/create
{
  "pv_no": "PV/25-26/0010",
  "bank_account_code": "1010-PETTY-001",
  "bank_name": "Head Office Petty Cash",
  "payment_mode": "Cash",
  "supplier_type": "Vendor",
  "supplier_id": "VND-001",
  "gross_amount": 5000,
  "entries": [
    { "dr_cr": "Dr", "account_name": "Vendor A/c", "debit_amt": 5000, "credit_amt": 0 },
    { "dr_cr": "Cr", "account_name": "Head Office Petty Cash", "debit_amt": 0, "credit_amt": 5000 }
  ],
  "narration": "Cash payment to vendor"
}
```

Approve:
```json
PATCH /paymentvoucher/approve/:id
{ "bank_account_code": "1010-PETTY-001" }
```

After approval: petty cash balance decreases by 5000.

### Cash Receipt (RV)

```json
POST /receiptvoucher/create
{
  "rv_no": "RV/25-26/0005",
  "bank_account_code": "1010-PETTY-001",
  "bank_name": "Head Office Petty Cash",
  "receipt_mode": "Cash",
  "supplier_type": "Vendor",
  "supplier_id": "VND-001",
  "amount": 2000,
  "entries": [
    { "dr_cr": "Dr", "account_name": "Head Office Petty Cash", "debit_amt": 2000, "credit_amt": 0 },
    { "dr_cr": "Cr", "account_name": "Vendor A/c", "debit_amt": 0, "credit_amt": 2000 }
  ],
  "narration": "Cash refund from vendor"
}
```

After approval: petty cash balance increases by 2000.

### Cash to Bank Transfer (Journal Entry)

```json
POST /journalentry/create
{
  "je_no": "JE/25-26/0012",
  "je_date": "2026-03-25",
  "je_type": "Inter-Account Transfer",
  "narration": "Deposit petty cash to HDFC bank",
  "lines": [
    { "account_code": "1020-HDFC-001", "debit_amt": 20000, "credit_amt": 0 },
    { "account_code": "1010-PETTY-001", "debit_amt": 0, "credit_amt": 20000 }
  ]
}
```

After approval:
- Cash balance decreases by 20000
- Bank balance increases by 20000

---

## Account Code Convention

| Prefix | Type | Example |
|---|---|---|
| `1010-PETTY-xxx` | Petty cash | `1010-PETTY-001` |
| `1010-SITE-xxx` | Site cash | `1010-SITE-003` |
| `1010-OFFICE-xxx` | Office cash | `1010-OFFICE-001` |
| `1020-HDFC-xxx` | Bank (HDFC) | `1020-HDFC-001` |
| `1020-SBI-xxx` | Bank (SBI) | `1020-SBI-001` |
