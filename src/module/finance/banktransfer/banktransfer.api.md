# Bank Transfer — API Reference & Frontend Integration

**Base URL:** `/banktransfer`
**Auth:** JWT cookie or `Authorization: Bearer <token>`

---

## Overview

Bank Transfer handles internal fund movements between any two bank/cash accounts
(e.g. bank → bank, bank → cash, cash → bank, cash → cash).

On **approval**, the system automatically creates a **Journal Entry** (Dr destination, Cr source)
which triggers `applyBalanceLines()` — both account balances update in real time.

### Flow

```
Create (pending) → Approve → JE auto-created (approved) → Balances updated
                 ↘ Edit / Delete (while pending)
```

---

## Endpoints

### 1. Get Next Transfer Number

```
GET /banktransfer/next-no
Authorization: Bearer <token>
```

#### Response `200`

```json
{
  "status": true,
  "data": {
    "transfer_no": "BT/25-26/0001",
    "is_first": true
  }
}
```

---

### 2. List Bank Transfers

```
GET /banktransfer/list
    ?page=1
    &limit=20
    &status=pending
    &from_account_code=1020-HDFC-001
    &to_account_code=1010-PETTY-001
    &tender_id=TND-001
    &transfer_no=BT/25-26/0001
    &from_date=2026-01-01
    &to_date=2026-03-31
Authorization: Bearer <token>
```

All query params are optional.

#### Response `200`

```json
{
  "status": true,
  "data": [ { ... } ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 5,
    "pages": 1
  }
}
```

---

### 3. Get by ID

```
GET /banktransfer/:id
Authorization: Bearer <token>
```

#### Response `200`

```json
{
  "status": true,
  "data": {
    "_id": "...",
    "transfer_no": "BT/25-26/0001",
    "transfer_date": "2026-03-25T00:00:00.000Z",
    "document_year": "25-26",
    "from_account_code": "1020-HDFC-001",
    "from_account_name": "HDFC Current A/c",
    "to_account_code": "1010-PETTY-001",
    "to_account_name": "Head Office Petty Cash",
    "amount": 20000,
    "transfer_mode": "NEFT",
    "reference_no": "UTR123456",
    "cheque_no": "",
    "cheque_date": null,
    "tender_id": "",
    "tender_name": "",
    "narration": "Transfer from HDFC Current A/c to Head Office Petty Cash",
    "je_ref": null,
    "je_no": "",
    "status": "pending",
    "created_by": "",
    "approved_by": null,
    "approved_at": null
  }
}
```

---

### 4. Create Bank Transfer

```
POST /banktransfer/create
Authorization: Bearer <token>
Content-Type: application/json
```

#### Request Body

```json
{
  "transfer_no": "BT/25-26/0001",
  "transfer_date": "2026-03-25",
  "from_account_code": "1020-HDFC-001",
  "to_account_code": "1010-PETTY-001",
  "amount": 20000,
  "transfer_mode": "NEFT",
  "reference_no": "UTR123456",
  "narration": "Replenish petty cash from HDFC",
  "tender_id": "TND-001",
  "tender_name": "Road Construction Phase 1"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `transfer_no` | String | Yes | From `GET /banktransfer/next-no` |
| `transfer_date` | Date | No | Defaults to today |
| `document_year` | String | No | Defaults to current FY (e.g. `"25-26"`) |
| `from_account_code` | String | Yes | Source bank/cash account code |
| `from_account_name` | String | No | Auto-filled from AccountTree if omitted |
| `to_account_code` | String | Yes | Destination bank/cash account code |
| `to_account_name` | String | No | Auto-filled from AccountTree if omitted |
| `amount` | Number | Yes | Must be > 0 |
| `transfer_mode` | String | No | `NEFT` / `RTGS` / `IMPS` / `UPI` / `Cheque` / `Cash` / `Internal` (default `NEFT`) |
| `reference_no` | String | No | UTR / NEFT / RTGS reference number |
| `cheque_no` | String | No | Cheque number (if mode is Cheque) |
| `cheque_date` | Date | No | Cheque date |
| `tender_id` | String | No | For project-wise tracking |
| `tender_name` | String | No | Tender display name |
| `narration` | String | No | Auto-generated if omitted |
| `status` | String | No | `"draft"` or `"pending"` (default `"pending"`) |

**Validations:**
- Both `from_account_code` and `to_account_code` must be **leaf, posting, bank/cash** accounts in AccountTree
- `from_account_code` and `to_account_code` cannot be the same

#### Response `201`

```json
{
  "status": true,
  "message": "Bank transfer created",
  "data": { ... }
}
```

#### Response `400`

```json
{ "status": false, "message": "from_account_code and to_account_code cannot be the same" }
{ "status": false, "message": "Source account '...' is not a bank/cash account" }
```

---

### 5. Update Bank Transfer

```
PATCH /banktransfer/update/:id
Authorization: Bearer <token>
Content-Type: application/json
```

Only **pending / draft** transfers can be edited. Approved transfers are locked.

#### Request Body (all optional)

```json
{
  "transfer_date": "2026-03-26",
  "from_account_code": "1020-SBI-001",
  "to_account_code": "1010-PETTY-001",
  "amount": 25000,
  "transfer_mode": "RTGS",
  "reference_no": "UTR789012",
  "narration": "Updated transfer"
}
```

Editable fields: `transfer_date`, `document_year`, `from_account_code`, `from_account_name`, `to_account_code`, `to_account_name`, `amount`, `transfer_mode`, `reference_no`, `cheque_no`, `cheque_date`, `tender_id`, `tender_name`, `narration`.

#### Response `200`

```json
{ "status": true, "message": "Bank transfer updated", "data": { ... } }
```

---

### 6. Delete Bank Transfer

```
DELETE /banktransfer/delete/:id
Authorization: Bearer <token>
```

Only **pending / draft** transfers can be deleted. Approved transfers cannot be deleted.

#### Response `200`

```json
{ "status": true, "message": "Bank transfer deleted", "data": { "deleted": true, "transfer_no": "BT/25-26/0001" } }
```

---

### 7. Approve Bank Transfer

```
PATCH /banktransfer/approve/:id
Authorization: Bearer <token>
```

No request body needed — `approved_by` is taken from `req.user._id`.

#### What happens on approval

1. Both accounts re-validated (must still be active bank/cash posting accounts)
2. A **Journal Entry** is auto-created with status `"approved"`:
   - **Dr** `to_account_code` (money enters destination)
   - **Cr** `from_account_code` (money leaves source)
3. JE approval triggers `applyBalanceLines()` → both account balances update
4. Transfer marked as `"approved"`, `je_ref` and `je_no` saved

#### Response `200`

```json
{
  "status": true,
  "message": "Bank transfer approved",
  "data": {
    "_id": "...",
    "transfer_no": "BT/25-26/0001",
    "status": "approved",
    "je_ref": "<ObjectId>",
    "je_no": "JE/25-26/0045",
    "approved_by": "<ObjectId>",
    "approved_at": "2026-03-25T10:30:00.000Z",
    ...
  }
}
```

#### Response `400`

```json
{ "status": false, "message": "Already approved" }
{ "status": false, "message": "Transfer amount must be greater than 0" }
```

---

## Frontend Integration

### Step-by-step flow

1. **Fetch next number**: `GET /banktransfer/next-no` → pre-fill `transfer_no`
2. **Fetch bank/cash accounts**: `GET /finance-dropdown/bank-accounts` → populate "From" and "To" dropdowns
3. **User fills form**: select from/to accounts, enter amount, mode, reference, narration
4. **Create**: `POST /banktransfer/create` → transfer saved as `"pending"`
5. **Approve**: `PATCH /banktransfer/approve/:id` → JE created, balances updated

### Account dropdowns

Use the combined bank+cash dropdown:

```
GET /finance-dropdown/bank-accounts
```

Returns both bank and cash accounts with `account_category: "bank"` or `"cash"` and `current_balance`.

**Render:**

| `account_category` | Show |
|---|---|
| `"bank"` | `account_name` + `bank_name` + `branch_name` + `current_balance` |
| `"cash"` | `account_name` + `location` + `current_balance` |

Store the selected `account_code` as `from_account_code` or `to_account_code`.

### Transfer modes

| Mode | When to use |
|---|---|
| `NEFT` | Standard bank transfer (default) |
| `RTGS` | High-value real-time transfer |
| `IMPS` | Instant mobile transfer |
| `UPI` | UPI payment |
| `Cheque` | Cheque transfer — fill `cheque_no` and `cheque_date` |
| `Cash` | Physical cash movement between locations |
| `Internal` | Book transfer within same bank |

### Balance update after approval

| Account | Effect |
|---|---|
| `from_account_code` (source) | Balance **decreases** (Cr in JE) |
| `to_account_code` (destination) | Balance **increases** (Dr in JE) |

Example: Transfer 20,000 from HDFC (balance 5,00,000) to Petty Cash (balance 25,000):
- After approval: HDFC = 4,80,000, Petty Cash = 45,000

### Example: Bank to Cash (replenish petty cash)

```json
POST /banktransfer/create
{
  "transfer_no": "BT/25-26/0001",
  "transfer_date": "2026-03-25",
  "from_account_code": "1020-HDFC-001",
  "to_account_code": "1010-PETTY-001",
  "amount": 20000,
  "transfer_mode": "Cash",
  "narration": "Replenish petty cash from HDFC"
}
```

### Example: Cash to Bank (deposit cash)

```json
POST /banktransfer/create
{
  "transfer_no": "BT/25-26/0002",
  "transfer_date": "2026-03-25",
  "from_account_code": "1010-PETTY-001",
  "to_account_code": "1020-HDFC-001",
  "amount": 50000,
  "transfer_mode": "Cash",
  "narration": "Deposit site cash to HDFC bank"
}
```

### Example: Bank to Bank

```json
POST /banktransfer/create
{
  "transfer_no": "BT/25-26/0003",
  "transfer_date": "2026-03-25",
  "from_account_code": "1020-HDFC-001",
  "to_account_code": "1020-SBI-001",
  "amount": 100000,
  "transfer_mode": "NEFT",
  "reference_no": "UTR2026032500001",
  "narration": "Fund transfer to SBI account"
}
```

---

## Linked Journal Entry

Every approved bank transfer has a linked JE accessible via:

```
GET /journalentry/:je_ref
```

The JE has:
- `je_type: "Inter-Account Transfer"`
- `narration`: prefixed with the transfer number (e.g. `"BT/25-26/0001: Transfer from..."`)
- Two lines: Dr destination, Cr source
- `status: "approved"` (auto-approved at creation)
