# Weekly Billing — Approve API

## New Endpoint

```
PATCH /weeklybilling/api/approve/:billId
```

Dedicated approval endpoint for weekly contractor bills. Moves the bill from `Generated` or `Pending` → `Approved`, posts a Cr ledger entry for the contractor, and records who approved it.

---

## Changes Made

### 1. `WeeklyBilling.model.js`
Added two audit fields:

| Field | Type | Description |
|---|---|---|
| `approved_by` | `ObjectId` → `Employee` | The employee who approved the bill |
| `approved_at` | `Date` | Timestamp of approval |

### 2. `weeklyBilling.service.js`
Added `approveBill(billId, approvedBy)` static method:

- Fetches the bill by `_id` — throws 404 if not found
- Throws 400 if status is already `Approved`
- Throws 400 if status is `Cancelled`
- Delegates to existing `updateBillStatus("Approved")` for the ledger post
- Stamps `approved_by` and `approved_at` on the document

### 3. `weeklyBilling.controller.js`
Added `approveBill` controller:

- Reads `billId` from `req.params`
- Reads `req.user._id` as the approver (set by `verifyJWT`)
- Returns `200` with the updated bill on success

### 4. `weeklyBilling.route.js`
Added route (placed before the generic `/status` route):

```
PATCH /api/approve/:billId   → approveBill controller
```

---

## Request

```
PATCH /weeklybilling/api/approve/:billId
Authorization: Bearer <token>

(no body required)
```

## Response — Success `200`

```json
{
  "status": true,
  "message": "Bill approved and posted to ledger",
  "data": {
    "_id": "...",
    "bill_no": "WB/TND-001/25-26/0001",
    "status": "Approved",
    "approved_by": "<employee_id>",
    "approved_at": "2026-03-25T10:00:00.000Z",
    "total_amount": 59000,
    "net_payable": 55000,
    ...
  }
}
```

## Response — Already Approved `400`

```json
{
  "status": false,
  "message": "Bill is already approved"
}
```

## Response — Cancelled Bill `400`

```json
{
  "status": false,
  "message": "Cannot approve a cancelled bill"
}
```

## Response — Not Found `404`

```json
{
  "status": false,
  "message": "Bill not found"
}
```

---

## Side Effects on Approval

When a bill is approved the following happen automatically:

1. **Status sync** — All child `WeeklyBillingTransaction` records are updated to `Approved`.
2. **Ledger post** — A `Cr` entry is posted to `LedgerEntry` for the contractor (`vch_type: "WeeklyBill"`).
3. **Audit trail** — `approved_by` (Employee ref) and `approved_at` (timestamp) are written to the bill document.

---

## Finance Approve API — All Modules Reference

| Module | Endpoint |
|---|---|
| Purchase Bill | `PATCH /purchasebill/approve/:id` |
| Weekly Billing | `PATCH /weeklybilling/api/approve/:billId` |
| Credit Note | `PATCH /creditnote/approve/:id` |
| Debit Note | `PATCH /debitnote/approve/:id` |
| Payment Voucher | `PATCH /paymentvoucher/approve/:id` |
| Receipt Voucher | `PATCH /receiptvoucher/approve/:id` |
| Journal Entry | `PATCH /journalentry/approve/:id` |
