# Company Bank Account — API Reference

**Base URL:** `/companybankaccount`
**Module:** `finance → companybankaccount`
**Auth:** JWT cookie or `Authorization: Bearer <token>`

---

## Overview

The Company Bank Account module stores the **company's own physical bank accounts** (SBI Current A/c, HDFC OD, etc.).

Each record is automatically linked to a corresponding **AccountTree leaf** (`is_bank_cash: true`) under the `1020` Bank Accounts group. This means company bank accounts appear in the Chart of Accounts and can be selected as the paying bank in Payment Vouchers.

### Separation of Concerns

| Account type | Where stored |
|---|---|
| Company's own bank accounts | **This module** (`/companybankaccount`) |
| Vendor bank details | `vendor.bank_details` (in Vendor record) |
| Contractor bank details | `contractor.account_details` (in Contractor record) |
| Vendor/Contractor payables in COA | AccountTree personal ledger (`2010-VND-xxx`, `2020-CTR-xxx`) |

---

## Endpoints

### 1. List All Company Bank Accounts

```
GET /companybankaccount/list
```

Returns all active (non-deleted) company bank accounts.

**Success Response `200`**

```json
{
  "status": true,
  "data": [
    {
      "_id": "...",
      "account_code": "1020-HDFC-001",
      "account_name": "HDFC Current Account",
      "bank_name": "HDFC Bank",
      "account_number": "50100123456789",
      "ifsc_code": "HDFC0001234",
      "bank_address": "MG Road Branch, Bengaluru",
      "account_holder_name": "Romaa Construction Pvt Ltd",
      "account_type": "Current",
      "interest_pct": 0,
      "credit_limit": 0,
      "debit_limit": 0,
      "discount_limit": 0,
      "is_active": true,
      "is_deleted": false,
      "createdAt": "2025-01-01T00:00:00.000Z",
      "updatedAt": "2025-01-01T00:00:00.000Z"
    }
  ]
}
```

---

### 2. Get by Account Code

```
GET /companybankaccount/by-code/:code
```

**URL Params:** `code` — the AccountTree `account_code` e.g. `1020-HDFC-001`

**Example Request**

```
GET /companybankaccount/by-code/1020-HDFC-001
```

**Success Response `200`**

```json
{
  "status": true,
  "data": { ...company bank account fields... }
}
```

**Error Responses**

| Status | Condition | Message |
|---|---|---|
| `404` | Code not found | `"Company bank account '1020-HDFC-001' not found"` |

---

### 3. Get by ID

```
GET /companybankaccount/:id
```

**URL Params:** `id` — MongoDB `_id`

**Success Response `200`**

```json
{
  "status": true,
  "data": { ...company bank account fields... }
}
```

**Error Responses**

| Status | Condition | Message |
|---|---|---|
| `404` | Not found | `"Company bank account not found"` |

---

### 4. Create Company Bank Account

```
POST /companybankaccount/create
Content-Type: application/json
```

Creates a company bank account record **and** automatically creates or links the corresponding AccountTree leaf under `1020` (Bank Accounts group).

**Request Body**

```json
{
  "account_code":        "1020-HDFC-001",
  "account_name":        "HDFC Current Account",
  "bank_name":           "HDFC Bank",
  "account_number":      "50100123456789",
  "ifsc_code":           "HDFC0001234",
  "bank_address":        "MG Road Branch, Bengaluru",
  "account_holder_name": "Romaa Construction Pvt Ltd",
  "account_type":        "Current",
  "interest_pct":        0,
  "credit_limit":        0,
  "debit_limit":         0,
  "discount_limit":      0
}
```

**Request Fields**

| Field | Type | Required | Description |
|---|---|---|---|
| `account_code` | `string` | **Yes** | Unique code — convention: `1020-<BANK>-<SEQ>` e.g. `1020-HDFC-001` |
| `account_name` | `string` | **Yes** | Display name shown in dropdowns |
| `bank_name` | `string` | **Yes** | Bank name e.g. `HDFC Bank`, `SBI`, `ICICI` |
| `account_number` | `string` | **Yes** | Actual bank account number |
| `ifsc_code` | `string` | No | Branch IFSC code |
| `bank_address` | `string` | No | Branch address |
| `account_holder_name` | `string` | No | Registered account holder (usually company name) |
| `account_type` | `string` | No | `Savings` / `Current` / `OD` / `CC` / `Fixed Deposit` |
| `interest_pct` | `number` | No | Interest % — relevant for `OD` / `CC` accounts |
| `credit_limit` | `number` | No | Sanctioned OD/CC credit limit |
| `debit_limit` | `number` | No | Max daily debit allowed |
| `discount_limit` | `number` | No | Bill discounting limit |

**account_code naming convention**

| Bank | Suggested code |
|---|---|
| HDFC Current A/c | `1020-HDFC-001` |
| SBI Current A/c | `1020-SBI-001` |
| ICICI OD A/c | `1020-ICICI-001` |
| Petty Cash | Already under `1010` in AccountTree |

**Side effect:** An AccountTree leaf is auto-created with:
- `parent_code: "1020"` (Bank Accounts group)
- `account_type: "Asset"`, `account_subtype: "Current Asset"`, `normal_balance: "Dr"`
- `is_bank_cash: true`, `is_posting_account: true`

**Success Response `201`**

```json
{
  "status": true,
  "message": "Company bank account created",
  "data": {
    "_id": "...",
    "account_code": "1020-HDFC-001",
    "account_name": "HDFC Current Account",
    "bank_name": "HDFC Bank",
    "account_number": "50100123456789",
    "is_active": true,
    "is_deleted": false
  }
}
```

**Error Responses**

| Status | Condition | Message |
|---|---|---|
| `400` | `account_code` missing | `"account_code is required"` |
| `400` | `account_name` missing | `"account_name is required"` |
| `400` | `bank_name` missing | `"bank_name is required"` |
| `400` | `account_number` missing | `"account_number is required"` |
| `400` | Duplicate `account_code` | `"Company bank account '1020-HDFC-001' already exists"` |

---

### 5. Update Company Bank Account

```
PATCH /companybankaccount/update/:id
Content-Type: application/json
```

**URL Params:** `id` — MongoDB `_id`

Updates any combination of the allowed fields. Changing `account_name` also syncs the name to the linked AccountTree leaf.

**Updatable Fields**

`account_name`, `bank_name`, `account_number`, `ifsc_code`, `bank_address`, `account_holder_name`, `account_type`, `interest_pct`, `credit_limit`, `debit_limit`, `discount_limit`, `is_active`

**Example Request Body**

```json
{
  "credit_limit": 10000000,
  "interest_pct": 12.5,
  "account_type": "OD"
}
```

**Success Response `200`**

```json
{
  "status": true,
  "message": "Company bank account updated",
  "data": { ...updated fields... }
}
```

**Error Responses**

| Status | Condition | Message |
|---|---|---|
| `404` | Not found | `"Company bank account not found"` |

---

### 6. Delete Company Bank Account (Soft Delete)

```
DELETE /companybankaccount/delete/:id
```

**URL Params:** `id` — MongoDB `_id`

Sets `is_deleted: true` and `is_active: false`. Also deactivates the linked AccountTree leaf so it no longer appears in payment dropdowns.

**Success Response `200`**

```json
{
  "status": true,
  "message": "Company bank account deleted",
  "data": { "account_code": "1020-HDFC-001", "is_deleted": true, "is_active": false }
}
```

**Error Responses**

| Status | Condition | Message |
|---|---|---|
| `404` | Not found | `"Company bank account not found"` |
| `400` | Already deleted | `"Already deleted"` |

---

## Workflow

### Adding a new company bank account

```
1. POST /companybankaccount/create
   Body: { account_code, account_name, bank_name, account_number, ... }

   → CompanyBankAccount record created
   → AccountTree leaf auto-created under 1020 (is_bank_cash: true)

2. GET /accounttree/posting-accounts?is_bank_cash=true
   → New bank account now appears in Payment Voucher bank dropdown
```

### Viewing all bank accounts for payment selection

```
GET /companybankaccount/list
→ All active company bank accounts with full details

GET /accounttree/posting-accounts?is_bank_cash=true
→ Minimal list (account_code + account_name) for dropdown use
```

### Relationship with AccountTree

```
AccountTree (COA)
└── 1000  Assets
    └── 1020  Bank Accounts  (is_group: true)
        ├── 1020-HDFC-001   HDFC Current Account   (is_bank_cash: true)  ← auto-created by this module
        ├── 1020-SBI-001    SBI Current Account    (is_bank_cash: true)  ← auto-created by this module
        └── 1020-ICICI-001  ICICI OD Account       (is_bank_cash: true)  ← auto-created by this module

CompanyBankAccount collection
├── { account_code: "1020-HDFC-001", bank_name: "HDFC Bank", account_number: "...", ifsc: "..." }
├── { account_code: "1020-SBI-001",  bank_name: "SBI",       account_number: "...", ifsc: "..." }
└── { account_code: "1020-ICICI-001",bank_name: "ICICI",     account_number: "...", ifsc: "..." }
```
