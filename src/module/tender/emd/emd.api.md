# EMD (Earnest Money Deposit) API

**Base URL:** `http://localhost:8000/emd`

---

## Overview

The EMD module manages Earnest Money Deposit proposals for tenders. Each tender has one EMD record (`EmdModel`) that holds multiple proposals from different companies. When a proposal is **approved**, a snapshot is written into the `Tender` document under `emd.approved_emd_details`. Additionally, the `Tender.emd.approved_emd_details` object also holds **Security Deposit** tracking once a proposal is approved.

### Data Flow

```
EmdModel (proposals[])
    └── updateProposalWithApprovalRule (APPROVED)
            └── $set Tender.emd.approved_emd_details (single object)
                    ├── EMD tracking  → updateEmdDetailsService (tender.service)
                    └── SD tracking   → updateSDDetailsService  (tender.service)
```

### Auto-Ranking (L1-L5)

The system automatically ranks proposals based on their `proposed_amount`.
- Lowest bid = **L1**, second lowest = **L2**, etc.
- Ranking is capped at **L5** (bids beyond the top 5 are marked **L5+**).
- Proposals without a valid amount are ignored for ranking.
- Ranking is recalculated every time a proposal is added or its amount is updated.

---

## Models

### `EmdModel` (collection: `emds`)

| Field            | Type     | Description                                  |
|------------------|----------|----------------------------------------------|
| `tender_id`      | String   | Reference to the Tender                      |
| `emd_id`         | String   | Auto-generated ID (e.g. `EMD/0001`)          |
| `proposals`      | Array    | List of company proposals (see below)        |
| `created_by_user`| String   | User who created the record                  |

#### `proposals[]` sub-document

| Field             | Type   | Description                                           |
|-------------------|--------|-------------------------------------------------------|
| `proposal_id`     | String | Auto-generated (e.g. `PRO/0001`)                     |
| `company_name`    | String | **Required.** Name of the bidding company             |
| `proposed_amount` | Number | **Required.** Bid value proposed                      |
| `emd_percentage`  | Number | % used for EMD (auto-filled from `Tender.emd.emd_percentage`) |
| `emd_amount`      | Number | Auto-computed: `proposed_amount × emd_percentage / 100` |
| `currency`        | String | Default: `INR`                                        |
| `payment_method`  | String | e.g. `DD`, `NEFT`, etc.                               |
| `payment_bank`    | String | Bank name                                             |
| `dd_no`           | String | DD / cheque number                                    |
| `payment_date`    | Date   | Date of payment                                       |
| `status`          | String | **Required.** `PENDING` \| `APPROVED` \| `REJECTED` \| `REFUNDED` \| `FORFEITED` |
| `level`           | String | **Auto-assigned:** `L1`, `L2`, `L3`, `L4`, `L5`, `L5+` |
| `rejection_reason`| String | Reason for rejection (if applicable)                  |
| `rejected_date`   | Date   | Date of rejection                                     |
| `approved_by`     | String | Name of the user who approved                         |
| `approved_date`   | Date   | Date of approval                                      |
| `refund_date`     | Date   | Date of refund (if applicable)                        |
| `refund_reference`| String | Refund reference number                               |
| `notes`           | String | Internal notes                                        |
| `documents`       | Array  | `{ doc_type, doc_url, uploaded_at }`                  |

---

### `Tender.emd.approved_emd_details` (embedded in TenderModel)

This is a **single object** (not an array) — written when a proposal is approved.

| Field                              | Type    | Description                                      |
|------------------------------------|---------|--------------------------------------------------|
| `emd_proposed_company`             | String  | Company name of approved proposal                |
| `emd_proposed_amount`              | Number  | Proposed bid amount                              |
| `emd_proposed_date`                | Date    | Proposal payment date                            |
| `emd_approved`                     | Boolean | `true` once approved                             |
| `emd_approved_date`                | Date    | Date of approval                                 |
| `emd_approved_by`                  | String  | User who approved                                |
| `emd_approved_amount`              | Number  | Actual EMD amount approved                       |
| `emd_approved_status`              | String  | `APPROVED`                                       |
| `emd_applied_bank`                 | String  | Bank name for EMD                                |
| `emd_applied_bank_branch`          | String  | Bank branch                                      |
| `emd_level`                        | String  | Level (General / Special)                        |
| `emd_note`                         | String  | Note for EMD                                     |
| `emd_deposit_amount_collected`     | Number  | Total EMD amount collected so far                |
| `emd_deposit_pendingAmount`        | Number  | EMD amount still pending                         |
| `emd_tracking`                     | Array   | EMD collection history (see below)               |
| `security_deposit_amount`          | Number  | Total SD amount                                  |
| `security_deposit_validity`        | Date    | SD validity date                                 |
| `security_deposit_status`          | String  | Status of SD                                     |
| `security_deposit_approved_by`     | String  | Who approved the SD                              |
| `security_deposit_approved_date`   | Date    | Date SD was approved                             |
| `security_deposit_amount_collected`| Number  | Total SD collected so far                        |
| `security_deposit_pendingAmount`   | Number  | SD amount still pending                          |
| `security_deposit_note`            | String  | Note for SD                                      |
| `security_deposit_tracking`        | Array   | SD collection history (see below)                |

#### `emd_tracking[]`
| Field                   | Type   |
|-------------------------|--------|
| `emd_note`              | String |
| `amount_collected`      | Number |
| `amount_pending`        | Number |
| `amount_collected_by`   | String |
| `amount_collected_date` | Date   |
| `amount_collected_time` | String |

#### `security_deposit_tracking[]`
| Field                     | Type   |
|---------------------------|--------|
| `security_deposit_note`   | String |
| `amount_collected`        | Number |
| `amount_pending`          | Number |
| `amount_collected_by`     | String |
| `amount_collected_date`   | Date   |
| `amount_collected_time`   | String |

---

## Endpoints

### 1. Add Proposal
**`POST /emd/addproposal/:tender_id`**

Adds a new company proposal to the tender's EMD record. Creates the EMD record if it doesn't exist yet. `emd_percentage` and `emd_amount` are auto-filled from the tender. **Triggers auto-ranking.**

**Request Body:**
```json
{
  "company_name": "ABC Constructions",
  "proposed_amount": 5000000,
  "payment_method": "DD",
  "payment_bank": "SBI",
  "dd_no": "123456",
  "payment_date": "2025-06-01",
  "status": "PENDING",
  "level": "General",
  "notes": "Initial proposal"
}
```

**Response `201`:**
```json
{
  "status": true,
  "message": "Proposal added to tender successfully",
  "data": { ...emdRecord }
}
```

---

### 2. Get EMD Record by Tender
**`GET /emd/getemd/:tender_id`**

Returns the full EMD record including all proposals for a tender.

**Response `200`:**
```json
{
  "status": true,
  "data": {
    "tender_id": "TND/0001",
    "emd_id": "EMD/0001",
    "proposals": [ ...proposalObjects ]
  }
}
```

**Response `404`:** EMD record not found.

---

### 3. Get All EMD Records
**`GET /emd/getall`**

Returns all EMD records across all tenders.

**Response `200`:**
```json
{
  "status": true,
  "data": [ ...emdRecords ]
}
```

---

### 4. Get Proposals Paginated
**`GET /emd/proposals/:tender_id?page=1&limit=10&search=`**

Returns a paginated, searchable list of proposals for a tender.

**Query Params:**
| Param    | Type   | Default | Description                                |
|----------|--------|---------|--------------------------------------------|
| `page`   | Number | `1`     | Page number                                |
| `limit`  | Number | `10`    | Results per page                           |
| `search` | String | `""`    | Filters by `company_name`, `proposal_id`, `status`, or `proposed_amount` |

**Response `200`:**
```json
{
  "status": true,
  "total": 5,
  "data": [ ...proposals ]
}
```

---

### 5. Update a Specific Proposal (Data Edit)
**`PUT /emd/updateproposal/:tender_id/:proposal_id`**

Updates editable fields of a specific proposal (amount, bank, date, notes, etc.). If `proposed_amount` is changed, `emd_amount` is automatically recalculated and **proposals are re-ranked**.

> **Note:** This endpoint is for **data edits only**. Use `/approveproposal` to change approval status.

**Request Body (any subset):**
```json
{
  "proposed_amount": 5500000,
  "payment_bank": "HDFC",
  "dd_no": "654321",
  "notes": "Updated proposal"
}
```

**Response `200`:**
```json
{
  "status": true,
  "message": "Proposal updated successfully",
  "data": { ...mongoUpdateResult }
}
```

---

### 6. Approve or Reject a Proposal
**`PUT /emd/approveproposal/:tender_id/:proposal_id`**

Approves or rejects a proposal. **Only one proposal can be `APPROVED` at a time.**

- On **APPROVED**: **All other proposals** are automatically set to `REJECTED`. `Tender.emd.approved_emd_details` is overwritten with the approved snapshot including Security Deposit details. The approved proposal also receives `approved_by` and `approved_date`.
- On **REJECTED**: The proposal status is updated. If it was previously approved, `Tender.emd.approved_emd_details` is cleared.

> [!TIP]
> This endpoint triggers a notification to the Finance and Tender teams on approval.

**Request Body:**
```json
{
  "status": "APPROVED",
  "level": "Special",
  "security_deposit": {
    "security_deposit_amount": 1000000,
    "security_deposit_validity": "2026-12-31"
  }
}
```

| Field                              | Required           | Description                              |
|------------------------------------|--------------------|------------------------------------------|
| `status`                           | ✅ Yes             | `APPROVED` \| `REJECTED` \| `PENDING`   |
| `level`                            | No                 | e.g. `General`, `Special`               |
| `security_deposit.security_deposit_amount`   | Required if APPROVED | SD amount in ₹          |
| `security_deposit.security_deposit_validity` | No               | SD validity date                         |

**Response `200`:**
```json
{
  "status": true,
  "message": "Proposal updated successfully",
  "data": { ...emdRecord }
}
```

**Side effect on Tender document (APPROVED):**
```json
{
  "emd.approved_emd_details": {
    "emd_proposed_company": "ABC Constructions",
    "emd_approved": true,
    "emd_approved_amount": 50000,
    "emd_deposit_pendingAmount": 50000,
    "security_deposit_amount": 1000000,
    "security_deposit_pendingAmount": 1000000,
    "emd_tracking": [],
    "security_deposit_tracking": []
  }
}
```

---

### 7. Update Full EMD Record
**`PUT /emd/update/:tender_id`**

Replaces the entire EMD record. Use with caution — primarily for bulk corrections.

**Request Body:**
```json
{
  "proposals": [ ...proposalObjects ]
}
```

**Response `200`:**
```json
{
  "status": true,
  "message": "EMD record updated successfully",
  "data": { ...emdRecord }
}
```

---

### 8. Reject a Specific Proposal
**`PUT /emd/rejectproposal/:tender_id/:proposal_id`**

Rejects a single proposal with an optional reason.

- If the proposal was previously **APPROVED**, `Tender.emd.approved_emd_details` in the Tender document is cleared.
- Sets `status` to `REJECTED`, `rejected_date` to now, and saves the `rejection_reason`.

**Request Body:**
```json
{
  "rejection_reason": "Escalated price beyond budget"
}
```

**Response `200`:**
```json
{
  "status": true,
  "message": "Proposal rejected successfully",
  "data": { ...emdRecord }
}
```

---

### 9. Remove a Proposal
**`DELETE /emd/removeproposal/:tender_id/:proposal_id`**

Removes a specific proposal from the EMD record (by `proposal_id`).

**Response `200`:**
```json
{
  "status": true,
  "message": "Proposal removed successfully",
  "data": { ...mongoUpdateResult }
}
```

---

### 10. Delete Entire EMD Record
**`DELETE /emd/delete/:tender_id`**

Deletes the entire EMD record for a tender. Does not affect `Tender.emd.approved_emd_details`.

**Response `200`:**
```json
{
  "status": true,
  "message": "EMD record deleted successfully",
  "data": { ...deletedRecord }
}
```

---

## EMD & Security Deposit Collection (via Tender Service)

> These endpoints are on the **Tender** router, not the EMD router, because they update `Tender.emd.approved_emd_details` directly.

### Collect EMD Payment
**`PATCH /tender/update-emd/:tender_id`**

Adds a collection entry to `emd_tracking`, increments `emd_deposit_amount_collected`, and decrements `emd_deposit_pendingAmount`.

**Request Body:**
```json
{
  "emd_deposit_amount_collected": 20000,
  "emd_note": "First instalment received"
}
```

---

### Collect Security Deposit Payment
**`PATCH /tender/update-sd/:tender_id`**

Adds a collection entry to `security_deposit_tracking`, increments `security_deposit_amount_collected`, and decrements `security_deposit_pendingAmount`.

**Request Body:**
```json
{
  "security_deposit_amount_collected": 100000,
  "security_deposit_note": "SD first tranche"
}
```

---

### Get EMD Tracking History
**`GET /tender/emd-tracking/:tender_id`**

Returns the full `emd_tracking` array from `Tender.emd.approved_emd_details`.

---

### Get Security Deposit Tracking History
**`GET /tender/sd-tracking/:tender_id`**

Returns the full `security_deposit_tracking` array from `Tender.emd.approved_emd_details`.

---

## Error Responses

All endpoints return errors in the format:

```json
{
  "status": false,
  "message": "Error description"
}
```

| HTTP Code | Meaning                               |
|-----------|---------------------------------------|
| `400`     | Validation error / bad request        |
| `404`     | Record not found                      |
| `500`     | Internal server error                 |
