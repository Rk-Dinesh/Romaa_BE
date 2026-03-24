# Journal Entry — API Reference

**Base URL:** `/journalentry`
**Module:** `finance → journalentry`
**Auth:** JWT cookie or `Authorization: Bearer <token>` (currently commented out during development)

---

## Overview

A **Journal Entry (JE)** is the general-purpose double-entry record used for transactions that do not have a dedicated voucher (Purchase Bill, Payment, etc.).

Every JE must balance: **Σ Debit = Σ Credit**. Approved entries are permanently posted and cannot be edited — errors are corrected by creating a **Reversal JE** (Dr↔Cr swapped).

### When to Use a Journal Entry

| `je_type` | Use Case |
|---|---|
| `Opening Balance` | Enter historical account balances when going live on the system |
| `Depreciation` | Monthly/yearly write-down of assets: Dr Depreciation Exp / Cr Accumulated Depreciation |
| `Bank Reconciliation` | Bank charges, interest credit from bank statement |
| `Payroll` | Monthly salary: Dr Salary Expense / Cr Bank + PF Payable + TDS Payable |
| `Accrual` | Expense incurred but not yet invoiced (month-end accrual) |
| `Provision` | Dr Bad Debt Expense / Cr Provision for Bad Debts |
| `ITC Reversal` | GST input tax credit reversal: Dr ITC Reversal Liability / Cr CGST/SGST Input |
| `Inter-Account Transfer` | Move funds between bank accounts or cost centres |
| `Reversal` | System-generated reversal of a prior approved JE |
| `Adjustment` | General period-end or audit adjustment |

### Supplier Cross-Posting

When a JE line references a **personal ledger account** (e.g. `2010-VND-001`), the service automatically also posts to `LedgerEntry` so the supplier payables register stays accurate. The line needs `supplier_id`, `supplier_type`, and `supplier_ref` — these are auto-read from the AccountTree if the account has `linked_supplier_id` set.

---

## Endpoints

### 1. Get Next JE Number

```
GET /journalentry/next-no
```

Returns the `je_no` that will be assigned to the next journal entry. Call this before opening the create form.

**Auth required:** No (dev) / `finance > journalentry > read` (prod)

**Success Response `200`**

```json
{
  "status": true,
  "je_no": "JE/25-26/0001",
  "is_first": true
}
```

| Field | Description |
|---|---|
| `je_no` | Next JE number to use in the create payload |
| `is_first` | `true` if no JEs exist yet in this financial year |

**Notes**
- Format: `JE/<FY>/<seq>` — e.g. `JE/25-26/0042`
- FY resets every April 1 (Indian Apr–Mar financial year)
- Read-only preview — does not reserve or create anything

---

### 2. List Journal Entries

```
GET /journalentry/list
```

**Auth required:** No (dev) / `finance > journalentry > read` (prod)

**Query Parameters**

| Param | Type | Description |
|---|---|---|
| `je_type` | `string` | Filter by type — e.g. `Depreciation`, `Payroll` |
| `status` | `string` | `draft` / `pending` / `approved` |
| `tender_id` | `string` | Filter by tender |
| `financial_year` | `string` | e.g. `25-26` |
| `is_reversal` | `boolean` | `true` = only reversal entries |
| `je_no` | `string` | Exact match |
| `account_code` | `string` | Find all JEs that touched a specific account |
| `from_date` | `YYYY-MM-DD` | `je_date ≥ from_date` |
| `to_date` | `YYYY-MM-DD` | `je_date ≤ to_date` (time set to 23:59:59) |

**Example Requests**

```
GET /journalentry/list
GET /journalentry/list?je_type=Depreciation&financial_year=25-26
GET /journalentry/list?account_code=1010&from_date=2025-04-01
GET /journalentry/list?status=pending
GET /journalentry/list?tender_id=TND-001
```

**Success Response `200`**

```json
{
  "status": true,
  "data": [
    {
      "_id": "...",
      "je_no": "JE/25-26/0001",
      "je_date": "2026-03-31T00:00:00.000Z",
      "financial_year": "25-26",
      "je_type": "Depreciation",
      "narration": "Monthly depreciation on Plant & Machinery — March 2026",
      "lines": [
        {
          "account_code": "5420",
          "account_name": "Depreciation — Plant & Machinery",
          "account_type": "Expense",
          "dr_cr": "Dr",
          "debit_amt": 12500,
          "credit_amt": 0
        },
        {
          "account_code": "1145",
          "account_name": "Accumulated Depreciation — Plant & Machinery",
          "account_type": "Asset",
          "dr_cr": "Cr",
          "debit_amt": 0,
          "credit_amt": 12500
        }
      ],
      "total_debit": 12500,
      "total_credit": 12500,
      "status": "approved",
      "is_posted": true,
      "is_reversal": false,
      "approved_at": "2026-03-31T18:00:00.000Z"
    }
  ]
}
```

---

### 3. Get Journal Entry by ID

```
GET /journalentry/:id
```

**Auth required:** No (dev) / `finance > journalentry > read` (prod)

**Success Response `200`**

```json
{
  "status": true,
  "data": { "je_no": "JE/25-26/0001", "..." }
}
```

**Error Responses**

| Status | Condition | Message |
|---|---|---|
| `404` | `id` not found | `"Journal entry not found"` |

---

### 4. Create Journal Entry

```
POST /journalentry/create
Content-Type: application/json
```

**Auth required:** No (dev) / `finance > journalentry > create` (prod)

**Request Body**

```json
{
  "je_no":      "JE/25-26/0001",
  "je_date":    "2026-03-31",
  "je_type":    "Depreciation",
  "narration":  "Monthly depreciation on Plant & Machinery — March 2026",
  "lines": [
    {
      "account_code": "5420",
      "dr_cr":        "Dr",
      "debit_amt":    12500,
      "credit_amt":   0,
      "narration":    "Depreciation expense"
    },
    {
      "account_code": "1145",
      "dr_cr":        "Cr",
      "debit_amt":    0,
      "credit_amt":   12500,
      "narration":    "Accumulated depreciation"
    }
  ],
  "tender_id":   "TND-001",
  "tender_name": "INFRA Road Project Phase 1",
  "status":      "pending"
}
```

**Request Fields**

| Field | Type | Required | Description |
|---|---|---|---|
| `je_no` | `string` | **Yes** | From `GET /next-no` |
| `je_date` | `date` | No | Defaults to today |
| `je_type` | `string` | No | See type enum above. Default: `Adjustment` |
| `narration` | `string` | **Yes** | Explains the purpose — mandatory for audit trail |
| `lines` | `array` | **Yes** | Min 2 lines. Must balance (Σ Dr = Σ Cr) |
| `tender_id` | `string` | No | Link to a tender for project-scoped reporting |
| `tender_ref` | `ObjectId` | No | MongoDB `_id` of the tender |
| `tender_name` | `string` | No | Snapshot of tender name |
| `auto_reverse_date` | `date` | No | If set, a reversal JE is auto-created on this date (for accruals) |
| `status` | `string` | No | `draft` / `pending` / `approved`. Default: `pending` |
| `created_by` | `ObjectId` | No | Employee `_id` who created the entry |

**`lines[]` fields**

| Field | Type | Required | Description |
|---|---|---|---|
| `account_code` | `string` | **Yes** | Must exist in AccountTree as a posting account (`is_group: false`, `is_posting_account: true`) |
| `dr_cr` | `"Dr" \| "Cr"` | No | Auto-derived from `debit_amt`/`credit_amt` if omitted |
| `debit_amt` | `number` | Yes (one side) | Amount on the debit side. Set to `0` for Cr lines |
| `credit_amt` | `number` | Yes (one side) | Amount on the credit side. Set to `0` for Dr lines |
| `narration` | `string` | No | Per-line description (useful for split entries) |

> **Server-auto-enriched fields on lines** (do not send):
> `account_name`, `account_type`, `supplier_id`, `supplier_type`, `supplier_ref` — read from AccountTree

**Validation Rules**
- At least 2 lines required
- Each line: exactly one of `debit_amt` or `credit_amt` must be > 0
- Entry must balance: Σ `debit_amt` = Σ `credit_amt`
- Each `account_code` must exist in AccountTree as a non-group posting account
- `narration` is required and cannot be blank

**Success Response `201`**

```json
{
  "status": true,
  "message": "Journal entry created",
  "data": {
    "_id": "...",
    "je_no": "JE/25-26/0001",
    "je_date": "2026-03-31T00:00:00.000Z",
    "financial_year": "25-26",
    "je_type": "Depreciation",
    "narration": "Monthly depreciation on Plant & Machinery — March 2026",
    "lines": [
      {
        "account_code": "5420",
        "account_name": "Depreciation — Plant & Machinery",
        "account_type": "Expense",
        "dr_cr": "Dr",
        "debit_amt": 12500,
        "credit_amt": 0
      },
      {
        "account_code": "1145",
        "account_name": "Accumulated Depreciation — Plant & Machinery",
        "account_type": "Asset",
        "dr_cr": "Cr",
        "debit_amt": 0,
        "credit_amt": 12500
      }
    ],
    "total_debit": 12500,
    "total_credit": 12500,
    "status": "pending",
    "is_posted": false,
    "createdAt": "2026-03-31T10:00:00.000Z"
  }
}
```

**Error Responses**

| Status | Condition | Message |
|---|---|---|
| `400` | `je_no` missing | `"je_no is required"` |
| `400` | `narration` blank | `"narration is required — explain the purpose of this journal entry"` |
| `400` | Fewer than 2 lines | `"A journal entry must have at least 2 lines (1 Dr + 1 Cr)"` |
| `400` | `account_code` not in AccountTree | `"Line 1: account 'XXXX' not found in Chart of Accounts"` |
| `400` | Account is a group | `"Line 1: account '5000' is a group account — transactions cannot be posted to group accounts"` |
| `400` | Both Dr and Cr > 0 on one line | `"Line 2: both debit_amt and credit_amt are > 0. A line must be either Dr or Cr."` |
| `400` | Entry doesn't balance | `"Journal entry does not balance: total Debit ₹12500 ≠ total Credit ₹11000. Difference: ₹1500"` |

---

### 5. Approve Journal Entry

```
PATCH /journalentry/approve/:id
```

Approves a journal entry and marks it as **posted** (`is_posted: true`). For lines referencing supplier personal ledger accounts, a corresponding `LedgerEntry` is also posted automatically.

**Auth required:** No (dev) / `finance > journalentry > edit` (prod)

**Success Response `200`**

```json
{
  "status": true,
  "message": "Journal entry approved and posted",
  "data": {
    "je_no": "JE/25-26/0001",
    "status": "approved",
    "is_posted": true,
    "approved_at": "2026-03-31T18:00:00.000Z"
  }
}
```

**Error Responses**

| Status | Condition | Message |
|---|---|---|
| `400` | `id` not found | `"Journal entry not found"` |
| `400` | Already approved | `"Already approved"` |
| `400` | No narration | `"Cannot approve a journal entry without a narration"` |

### Ledger Cross-Posting on Approval

If any line in the JE references a personal supplier account (e.g., `2010-VND-001` which has `linked_supplier_id` set), the service automatically calls `LedgerService.postEntry` for that line:

```
vch_type  : "Journal"
vch_no    : "<je_no>"
debit_amt : line.debit_amt
credit_amt: line.credit_amt
```

This keeps the supplier payables register (`/ledger/supplier/:supplierId`) accurate for all transactions, not just dedicated vouchers.

---

### 6. Reverse Journal Entry

```
POST /journalentry/reverse/:id
Content-Type: application/json
```

Creates a new **Reversal JE** that is the mirror image of the original (Dr↔Cr swapped on every line). This is the only way to correct an approved journal entry — entries are never edited after posting.

**Auth required:** No (dev) / `finance > journalentry > edit` (prod)

**Request Body**

```json
{
  "reversal_date": "2026-04-01",
  "narration": "Reversing March accrual for ABC Contractors invoice"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `reversal_date` | `date` | No | Date of the reversal JE. Defaults to today |
| `narration` | `string` | No | Custom narration. Defaults to `"Reversal of <original_je_no> — <original_narration>"` |

**Success Response `201`**

```json
{
  "status": true,
  "message": "Reversal journal entry created and posted",
  "data": {
    "_id": "...",
    "je_no": "JE/25-26/0002",
    "je_type": "Reversal",
    "is_reversal": true,
    "reversal_of": "<original_id>",
    "reversal_of_no": "JE/25-26/0001",
    "status": "approved",
    "is_posted": true,
    "lines": [
      {
        "account_code": "5420",
        "dr_cr": "Cr",
        "debit_amt": 0,
        "credit_amt": 12500
      },
      {
        "account_code": "1145",
        "dr_cr": "Dr",
        "debit_amt": 12500,
        "credit_amt": 0
      }
    ]
  }
}
```

**Error Responses**

| Status | Condition | Message |
|---|---|---|
| `400` | `id` not found | `"Journal entry not found"` |
| `400` | Not yet approved | `"Only approved journal entries can be reversed"` |
| `400` | Reversing a reversal | `"A reversal entry cannot itself be reversed"` |
| `400` | Already reversed | `"Already reversed — see JE JE/25-26/0002"` |

> The reversal JE is automatically approved and posted (`status: "approved"`, `is_posted: true`). No separate approve call is needed.

---

### 7. Process Auto-Reversals

```
POST /journalentry/process-auto-reversals
```

Processes all journal entries with `auto_reverse_date ≤ today` that haven't been reversed yet. Called by a daily cron or manually by an admin.

**Auth required:** No (dev) / `finance > journalentry > edit` (prod)
**Request Body:** None

**Use Case:** Accrual entries set with `auto_reverse_date` are automatically reversed at the start of the next period. Example: book an accrued expense on March 31 with `auto_reverse_date: 2026-04-01` — the system auto-reverses it on April 1.

**Success Response `200`**

```json
{
  "status": true,
  "results": [
    {
      "original": "JE/25-26/0005",
      "reversal": "JE/26-27/0001",
      "status": "ok"
    },
    {
      "original": "JE/25-26/0006",
      "status": "error",
      "message": "Already reversed — see JE JE/25-26/0009"
    }
  ]
}
```

| Field | Description |
|---|---|
| `original` | JE number of the original accrual entry |
| `reversal` | JE number of the newly created reversal (only on `status: "ok"`) |
| `status` | `"ok"` or `"error"` |
| `message` | Error reason (only on `status: "error"`) |

---

## Workflow

### Standard Journal Entry (e.g. Depreciation)

```
1. GET  /journalentry/next-no            → pre-fill je_no

2. GET  /accounttree/posting-accounts    → populate account dropdowns in the form

3. POST /journalentry/create             → save as "pending"
   {
     je_no, je_date, je_type: "Depreciation", narration,
     lines: [ { account_code, dr_cr, debit_amt/credit_amt } ]
   }

4. Review

5. PATCH /journalentry/approve/:id       → post to ledger
   → status: "approved", is_posted: true
   → LedgerEntry created for any supplier lines
```

### Accrual Entry with Auto-Reversal

```
1–5. Same as above, but include:
   { "auto_reverse_date": "2026-04-01" }

6. On April 1, cron / admin calls:
   POST /journalentry/process-auto-reversals
   → Reversal JE created and approved automatically
   → auto_reversed: true set on original
```

### Correcting an Error in a Posted Entry

```
Approved JEs are immutable — never edited. To correct:

1. POST /journalentry/reverse/:id
   { "reversal_date": "<today>", "narration": "Correction: wrong account used" }
   → Reversal JE created (Dr↔Cr swapped), immediately approved and posted
   → Net effect on ledger = zero (original + reversal cancel out)

2. POST /journalentry/create   → create new correct entry
3. PATCH /journalentry/approve/:id
```

---

## Financial Year

JEs are filed under the Indian Apr–Mar financial year:

| Date | Financial Year |
|---|---|
| March 31, 2026 | `25-26` |
| April 1, 2026 | `26-27` |

`financial_year` is auto-computed from `je_date` — never send it in the payload.

---

## Double-Entry Examples

### Bank Reconciliation — Bank Charge

```
Dr  Bank Charges (5310)        ₹500
Cr  HDFC Current Account (1020) ₹500
```

### Salary Disbursement (Payroll)

```
Dr  Salary Expense (5200)        ₹1,50,000
Cr  HDFC Current Account (1020)   ₹1,30,000   ← net pay
Cr  PF & ESI Payable (2130)        ₹15,000    ← PF/ESI deducted
Cr  TDS Payable (2140)              ₹5,000    ← TDS deducted
```

### ITC Reversal (GST input credit lost)

```
Dr  ITC Reversal Liability (2150)   ₹1,800
Cr  CGST Input ITC (1110)             ₹900
Cr  SGST Input ITC (1120)             ₹900
```

### Opening Balance (going live)

```
Dr  HDFC Current Account (1020)   ₹5,00,000
Cr  Opening Balance Equity (3020) ₹5,00,000
```
