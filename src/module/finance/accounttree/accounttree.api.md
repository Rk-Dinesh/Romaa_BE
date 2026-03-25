# Account Tree (Chart of Accounts) — API Reference

**Base URL:** `/accounttree`
**Module:** `finance → accounttree`
**Auth:** JWT cookie or `Authorization: Bearer <token>`

---

## Overview

The Account Tree is the **Chart of Accounts (COA)** — the master list of every financial account in the system. All vouchers (Purchase Bills, Credit Notes, Payment Vouchers, Journal Entries) reference accounts from this tree.

### Key Concepts

| Concept | Description |
|---|---|
| **Group account** | Parent node — no transactions can be posted directly. `is_group: true` |
| **Posting account** | Leaf node — transactions are posted here. `is_group: false, is_posting_account: true` |
| **Normal balance** | `Dr` for Assets & Expenses; `Cr` for Liabilities, Equity & Income |
| **Personal ledger** | Auto-created leaf for each vendor/contractor. e.g. `2010-VND-001` |
| **System account** | Seeded account — `account_code`, `account_type`, `normal_balance` are locked |

### Account Type → Normal Balance

| Account Type | Normal Balance | Range |
|---|---|---|
| Asset | Dr | `1000–1999` |
| Liability | Cr | `2000–2999` |
| Equity | Cr | `3000–3999` |
| Income | Cr | `4000–4999` |
| Expense | Dr | `5000–5999` |

---

## Endpoints

### 1. List All Accounts

```
GET /accounttree/list
```

All accounts (non-deleted). All query params are optional and combinable.

**Query Parameters**

| Param | Type | Description |
|---|---|---|
| `account_type` | `string` | `Asset` / `Liability` / `Equity` / `Income` / `Expense` |
| `account_subtype` | `string` | e.g. `Current Asset`, `Fixed Asset`, `Current Liability` |
| `parent_code` | `string` | Filter by direct parent — e.g. `2010` |
| `tax_type` | `string` | `CGST_Input`, `SGST_Input`, `IGST_Input`, `TDS`, etc. |
| `is_group` | `boolean` | `true` = group accounts only; `false` = posting accounts only |
| `is_posting_account` | `boolean` | `true` = only accounts that accept transactions |
| `is_bank_cash` | `boolean` | `true` = bank/cash accounts (used in payment dropdowns) |
| `is_personal` | `boolean` | `true` = personal ledger accounts (vendor/contractor/client) |
| `is_active` | `boolean` | `true` = active accounts only |

**Example Requests**

```
GET /accounttree/list
GET /accounttree/list?account_type=Expense
GET /accounttree/list?is_personal=true
GET /accounttree/list?is_bank_cash=true
GET /accounttree/list?parent_code=2010
```

**Success Response `200`**

```json
{
  "status": true,
  "data": [
    {
      "_id": "...",
      "account_code": "1010",
      "account_name": "Cash in Hand",
      "account_type": "Asset",
      "account_subtype": "Current Asset",
      "normal_balance": "Dr",
      "parent_code": "1000",
      "level": 2,
      "is_group": false,
      "is_posting_account": true,
      "is_bank_cash": true,
      "is_personal": false,
      "is_system": true,
      "is_active": true,
      "is_deleted": false,
      "description": "Physical cash on hand at site / office",
      "tax_type": "None"
    }
  ]
}
```

---

### 2. Posting Accounts (Voucher Dropdowns)

```
GET /accounttree/posting-accounts
```

Returns only leaf accounts that can receive transactions. **Use this to populate account dropdowns in Journal Entry and voucher forms.** Returns a minimal field set for fast loading.

**Query Parameters**

| Param | Type | Description |
|---|---|---|
| `account_type` | `string` | Filter by type |
| `is_bank_cash` | `boolean` | `true` = bank/cash accounts only (for Payment Voucher bank dropdown) |
| `tax_type` | `string` | e.g. `CGST_Input` — filter tax-specific accounts |

**Example Requests**

```
GET /accounttree/posting-accounts
GET /accounttree/posting-accounts?is_bank_cash=true
GET /accounttree/posting-accounts?account_type=Expense
GET /accounttree/posting-accounts?tax_type=CGST_Input
```

**Success Response `200`**

```json
{
  "status": true,
  "data": [
    {
      "account_code": "1010",
      "account_name": "Cash in Hand",
      "account_type": "Asset",
      "account_subtype": "Current Asset",
      "normal_balance": "Dr",
      "description": "Physical cash on hand at site / office"
    },
    {
      "account_code": "5100",
      "account_name": "Material Cost",
      "account_type": "Expense",
      "account_subtype": "Direct Cost",
      "normal_balance": "Dr",
      "description": "Cost of materials consumed on site"
    }
  ]
}
```

---

### 3. Hierarchical Tree

```
GET /accounttree/tree?root=<account_code>
```

Returns the full account hierarchy with each node containing a `children` array. Optionally scoped to a root account.

**Query Parameters**

| Param | Type | Description |
|---|---|---|
| `root` | `string` | Optional — scope tree to this account and its descendants. E.g. `root=2000` returns the entire Liability subtree |

**Example Requests**

```
GET /accounttree/tree
GET /accounttree/tree?root=2000
GET /accounttree/tree?root=5000
```

**Success Response `200`**

```json
{
  "status": true,
  "data": [
    {
      "account_code": "2000",
      "account_name": "Liabilities",
      "account_type": "Liability",
      "is_group": true,
      "children": [
        {
          "account_code": "2010",
          "account_name": "Vendor Payables",
          "is_group": true,
          "children": [
            {
              "account_code": "2010-VND-001",
              "account_name": "ABC Suppliers — Payable",
              "is_group": false,
              "is_personal": true,
              "linked_supplier_id": "VND-001",
              "linked_supplier_type": "Vendor",
              "children": []
            }
          ]
        },
        {
          "account_code": "2020",
          "account_name": "Contractor Payables",
          "is_group": true,
          "children": []
        }
      ]
    }
  ]
}
```

---

### 4. Search Accounts

```
GET /accounttree/search?q=<query>
```

Case-insensitive partial match against `account_name`, `account_code`, and `description`.

**Query Parameters**

| Param | Type | Required | Description |
|---|---|---|---|
| `q` | `string` | Yes | Search term — min 1 character |

**Example Requests**

```
GET /accounttree/search?q=CGST
GET /accounttree/search?q=bank
GET /accounttree/search?q=VND-001
```

**Success Response `200`**

```json
{
  "status": true,
  "data": [
    {
      "account_code": "1110",
      "account_name": "CGST Input ITC",
      "account_type": "Asset",
      "tax_type": "CGST_Input",
      "is_group": false,
      "is_posting_account": true
    }
  ]
}
```

---

### 5. Get Account by Code

```
GET /accounttree/by-code/:code
```

**Example Requests**

```
GET /accounttree/by-code/1010
GET /accounttree/by-code/2010-VND-001
```

**Success Response `200`**

```json
{
  "status": true,
  "data": {
    "account_code": "2010-VND-001",
    "account_name": "ABC Suppliers — Payable",
    "account_type": "Liability",
    "normal_balance": "Cr",
    "is_personal": true,
    "linked_supplier_id": "VND-001",
    "linked_supplier_type": "Vendor"
  }
}
```

**Error Responses**

| Status | Condition | Message |
|---|---|---|
| `404` | Code not found | `"Account 'XXXX' not found"` |

---

### 6. Get Account by Supplier

```
GET /accounttree/by-supplier/:supplierId?supplier_type=Vendor
```

Returns the personal ledger account linked to a specific vendor, contractor, or client.

**URL Params:** `supplierId` — business key e.g. `VND-001`, `CTR-002`
**Query Params:** `supplier_type` — `Vendor` / `Contractor` / `Client` (optional, for disambiguation)

**Example Requests**

```
GET /accounttree/by-supplier/VND-001?supplier_type=Vendor
GET /accounttree/by-supplier/CTR-002
```

**Success Response `200`**

```json
{
  "status": true,
  "data": {
    "account_code": "2010-VND-001",
    "account_name": "ABC Suppliers — Payable",
    "account_type": "Liability",
    "account_subtype": "Current Liability",
    "normal_balance": "Cr",
    "parent_code": "2010",
    "level": 3,
    "is_personal": true,
    "linked_supplier_id": "VND-001",
    "linked_supplier_type": "Vendor"
  }
}
```

> Returns `null` in `data` if no personal ledger has been created for this supplier yet.

---

### 6b. Get Account by ID

```
GET /accounttree/:id
```

**Auth required:** `finance > accounttree > read`

> **Note:** This route must be placed last in the route file — after all named paths — to avoid `:id` matching route names like `list`, `tree`, `search`, etc.

**Success Response `200`**

```json
{ "status": true, "data": { ...account fields... } }
```

**Error Responses**

| Status | Condition | Message |
|---|---|---|
| `404` | `id` not found | `"Account not found"` |

---

### 7. Create Account

```
POST /accounttree/create
Content-Type: application/json
```

**Auth required:** `finance > accounttree > create`

**Request Body**

```json
{
  "account_code":       "5500",
  "account_name":       "Site Temporary Works",
  "description":        "Temporary structures, formwork, scaffolding",
  "account_type":       "Expense",
  "account_subtype":    "Site Overhead",
  "parent_code":        "5000",
  "level":              2,
  "is_group":           false,
  "is_posting_account": true
}
```

**Request Fields**

| Field | Type | Required | Description |
|---|---|---|---|
| `account_code` | `string` | **Yes** | Unique code — e.g. `5500`, `2010-VND-003` |
| `account_name` | `string` | **Yes** | Display name |
| `account_type` | `string` | **Yes** | `Asset` / `Liability` / `Equity` / `Income` / `Expense` |
| `account_subtype` | `string` | No | See enum list below |
| `description` | `string` | No | Free-text description |
| `normal_balance` | `"Dr" \| "Cr"` | No | **Auto-set** from `account_type` if omitted (`Dr` for Asset/Expense, `Cr` for others) |
| `parent_code` | `string` | No | Parent account code |
| `level` | `number` | No | `0`=root, `1`=group, `2`=leaf, `3`=personal |
| `is_group` | `boolean` | No | Default `false`. Group accounts cannot receive postings |
| `is_posting_account` | `boolean` | No | Default `true`. Auto-set `false` if `is_group: true` |
| `is_bank_cash` | `boolean` | No | `true` for bank/cash accounts |
| `is_personal` | `boolean` | No | `true` for vendor/contractor/client personal ledgers |
| `linked_supplier_id` | `string` | No | e.g. `VND-001` — required when `is_personal: true` |
| `linked_supplier_type` | `string` | No | `Vendor` / `Contractor` / `Client` |
| `tax_type` | `string` | No | See enum list below |
| `opening_balance` | `number` | No | Historical opening balance |
| `opening_balance_type` | `"Dr" \| "Cr"` | No | Side of the opening balance |
| `opening_balance_date` | `date` | No | Date of opening balance entry |
| `bank_details` | `object` | No | Bank details — only relevant when `is_bank_cash: true` (see below) |

**`account_subtype` values**

`Current Asset`, `Fixed Asset`, `Contra Asset`, `Current Liability`, `Tax Liability`, `Long-term Liability`, `Capital`, `Reserves`, `Operating Income`, `Other Income`, `Direct Cost`, `Site Overhead`, `Admin Expense`, `Financial Expense`, `Depreciation`, `Other`

**`tax_type` values**

`None`, `CGST_Input`, `SGST_Input`, `IGST_Input`, `CGST_Output`, `SGST_Output`, `IGST_Output`, `CGST_RCM`, `SGST_RCM`, `IGST_RCM`, `TDS`, `ITC_Reversal`

> **RCM types:** `CGST_RCM`, `SGST_RCM`, `IGST_RCM` are used for Reverse Charge Mechanism payable accounts — seeded as account codes `2160`, `2170`, `2180` respectively.

**`bank_details` fields** — send only when `is_bank_cash: true`

| Field | Type | Description |
|---|---|---|
| `bank_details.bank_name` | `string` | Bank name e.g. `SBI`, `HDFC` |
| `bank_details.account_no` | `string` | Bank account number |
| `bank_details.ifsc_code` | `string` | Branch IFSC code |
| `bank_details.bank_address` | `string` | Branch address |
| `bank_details.account_type` | `string` | `Savings` / `Current` / `OD` / `CC` / `Fixed Deposit` |
| `bank_details.interest_pct` | `number` | Interest % on OD/CC accounts |
| `bank_details.credit_limit` | `number` | Sanctioned credit limit |
| `bank_details.debit_limit` | `number` | Max daily debit limit |
| `bank_details.discount_limit` | `number` | Bill discounting limit |

**Success Response `201`**

```json
{
  "status": true,
  "message": "Account created",
  "data": {
    "_id": "...",
    "account_code": "5500",
    "account_name": "Site Temporary Works",
    "account_type": "Expense",
    "normal_balance": "Dr",
    "is_group": false,
    "is_posting_account": true,
    "is_system": false,
    "is_active": true
  }
}
```

**Error Responses**

| Status | Condition | Message |
|---|---|---|
| `400` | `account_code` missing | `"account_code is required"` |
| `400` | `account_name` missing | `"account_name is required"` |
| `400` | `account_type` missing | `"account_type is required"` |
| `500` | Duplicate `account_code` | MongoDB unique constraint error |

---

### 8. Update Account

```
PATCH /accounttree/update/:id
Content-Type: application/json
```

**Auth required:** `finance > accounttree > edit`

Only the following fields can be changed:

`account_name`, `description`, `account_subtype`, `parent_code`, `is_group`, `is_posting_account`, `is_bank_cash`, `is_active`, `tax_type`, `opening_balance`, `opening_balance_type`, `opening_balance_date`, `bank_details`

> **`bank_details`** supports partial update — send only the fields you want to change (e.g. `{ "bank_details": { "credit_limit": 5000000 } }` updates just the credit limit).

> **System accounts** (`is_system: true`) cannot have `account_code`, `account_type`, `normal_balance`, or `is_system` changed.

**Request Body**

```json
{
  "account_name": "Site Temporary Works & Formwork",
  "is_active": true
}
```

**Success Response `200`**

```json
{
  "status": true,
  "message": "Account updated",
  "data": { "account_code": "5500", "account_name": "Site Temporary Works & Formwork", "..." }
}
```

**Error Responses**

| Status | Condition | Message |
|---|---|---|
| `404` | `id` not found | `"Account not found"` |
| `400` | Attempt to change locked field on system account | `"Cannot change 'account_code' on a system account"` |

---

### 9. Delete Account (Soft Delete)

```
DELETE /accounttree/delete/:id
```

**Auth required:** `finance > accounttree > delete`

Sets `is_deleted: true` and `is_active: false`. The account is hidden from all queries but preserved for historical reference.

**Blocked conditions:**
- Account is a system account (`is_system: true`)
- Account has active child accounts

**Success Response `200`**

```json
{
  "status": true,
  "message": "Account deleted",
  "data": { "account_code": "5500", "is_deleted": true, "is_active": false }
}
```

**Error Responses**

| Status | Condition | Message |
|---|---|---|
| `404` | `id` not found | `"Account not found"` |
| `400` | System account | `"Cannot delete a system account"` |
| `400` | Already deleted | `"Already deleted"` |
| `400` | Has children | `"Cannot delete '5000' — it has 3 child account(s)"` |

---

### 10. Seed Default Chart of Accounts

```
POST /accounttree/seed
```

Seeds the standard Indian construction ERP chart of accounts. **Idempotent** — safe to call multiple times, only missing accounts are inserted.

**Auth required:** `finance > accounttree > create`
**Request Body:** None

**Seeded accounts include:**

| Range | Type | Examples |
|---|---|---|
| 1000–1199 | Asset | Cash, Bank, Advances (Vendor/Contractor/EMD/SD), Material Inventory, CGST/SGST/IGST Input ITC, Plant & Machinery, Accumulated Depreciation |
| 2000–2180 | Liability | Vendor Payables group, Contractor Payables group, Advances from Clients, CGST/SGST/IGST Output, TDS Payable, PF & ESI, CGST/SGST/IGST Payable (RCM) |
| 2160–2180 | Liability | **RCM accounts** — CGST Payable (RCM) `2160`, SGST Payable (RCM) `2170`, IGST Payable (RCM) `2180` — Reverse Charge Mechanism payable accounts |
| 3000–3030 | Equity | Capital, Retained Earnings, Current Year P&L |
| 4000–4050 | Income | Project Revenue, Equipment Hire, Penalties Recovered |
| 5000–5430 | Expense | Material Cost, Contract Labour, Site Overheads, Admin, Depreciation |

**Success Response `200`**

```json
{
  "status": true,
  "message": "Seed complete",
  "data": {
    "inserted": 63,
    "skipped": 0,
    "message": "Seeded 63 accounts (0 already existed)"
  }
}
```

If already seeded:
```json
{
  "status": true,
  "message": "Seed complete",
  "data": {
    "inserted": 0,
    "skipped": 63,
    "message": "All default accounts already present"
  }
}
```

---

## Workflow

### Initial Setup

```
1. POST /accounttree/seed          → seed the standard COA on first run
2. GET  /accounttree/tree          → verify the full account hierarchy
3. GET  /accounttree/list?is_personal=true
                                   → verify personal ledgers are created for vendors/contractors
```

### Voucher Entry (Journal Entry / Payment / etc.)

```
1. GET /accounttree/posting-accounts
   → populate "Account" dropdown (all posting accounts)

2. GET /accounttree/posting-accounts?is_bank_cash=true
   → populate "Bank/Cash" dropdown in Payment Voucher

3. GET /accounttree/search?q=CGST
   → live search as user types in account field

4. GET /accounttree/by-supplier/VND-001?supplier_type=Vendor
   → get personal ledger account for a specific vendor
```

### Personal Ledger Auto-Creation

When a new vendor or contractor is registered, their personal ledger is auto-created:
- Vendor `VND-001` → account `2010-VND-001` under **2010 Vendor Payables** (Liability, Cr)
- Contractor `CTR-001` → account `2020-CTR-001` under **2020 Contractor Payables** (Liability, Cr)
- Client `CLT-001` → account `1050-CLT-001` under **1050 Client Receivables** (Asset, Dr)

This is handled internally by `AccountTreeService.autoCreatePersonalLedger()` — no manual API call needed.
