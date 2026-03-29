# Client Billing Module

Manages RA (Running Account) bills raised against a client for a tender. Each bill maps CSV measurement quantities against bid rates, computes GST, retention, deductions, and net payable.

---

## Bill ID Format

Auto-generated on upload: `CB/<FY>/<seq>`

| Example | Meaning |
|---|---|
| `CB/25-26/0001` | 1st bill of FY 2025-26 |
| `CB/25-26/0002` | 2nd bill of FY 2025-26 |
| `CB/26-27/0001` | 1st bill of FY 2026-27 |

Financial year rolls over on **April 1**. Sequence resets each FY.

---

## Bill Lifecycle

```
Draft → Submitted → Checked → Approved → Paid
                                       ↘ Rejected (any stage)
```

- Only **Draft** bills can be edited via `update-csv`.
- A new bill upload is blocked if any existing bill for the same `tender_id` is not `Approved` or `Paid`.
- Approval posts a receivable entry to the client ledger.

---

## API Reference

Base prefix: `/clientbilling`

---

### POST `/upload-csv`

Upload a new RA bill for a tender via CSV.

**Request:** `multipart/form-data`

| Field | Required | Description |
|---|---|---|
| `file` | Yes | CSV file (headers: Code, Description, Unit, Quantity, Mbook) |
| `tender_id` | Yes | e.g. `TND-001` |
| `bill_date` | No | Defaults to now |
| `tax_mode` | No | `instate` (default) or `otherstate` |
| `cgst_pct` | No | CGST % (instate only) |
| `sgst_pct` | No | SGST % (instate only) |
| `igst_pct` | No | IGST % (otherstate only) |
| `retention_pct` | No | Retention % |
| `deductions` | No | JSON string: `[{ "description": "TDS", "amount": 500 }]` |
| `created_by_user` | No | User name/ID |

**Validations:**
- Blocks if any existing bill for `tender_id` is not `Approved` or `Paid`
- CSV must yield at least one item

**Response `200`:**
```json
{ "status": true, "message": "CSV data uploaded successfully", "data": { /* bill */ } }
```

---

### PATCH `/update-csv?bill_id=CB/25-26/0001`

Re-upload CSV to update an existing bill. **Draft status only.**

**Query param:** `bill_id` — Bill to update

**Request:** `multipart/form-data` — same optional fields as upload (all optional except `file`)

**Response `200`:**
```json
{ "status": true, "message": "Bill updated successfully", "data": { /* bill */ } }
```

---

### GET `/history/:tender_id`

List all bills for a tender sorted by creation date.

**Response fields per bill:**

| Field | Description |
|---|---|
| `bill_id` | e.g. `CB/25-26/0001` |
| `bill_date` | Date of billing |
| `tender_id` / `tender_name` | Tender reference |
| `client_id` / `client_name` | Client reference |
| `grand_total` | Base amount before GST/deductions |
| `total_upto_date_amount` | Cumulative billed to date |
| `total_prev_bill_amount` | Previous bill cumulative |
| `total_tax` / `cgst_amt` / `sgst_amt` / `igst_amt` | Tax breakdown |
| `retention_amount` / `total_deductions` | Deductions |
| `net_amount` | Final payable |
| `amount_received` / `balance_due` | Payment tracking |
| `paid_status` | `unpaid` / `partial` / `paid` |
| `status` | Lifecycle status |

---

### GET `/api/details?tender_id=TND-001&bill_id=CB/25-26/0001`

Full bill details including all line items.

---

### GET `/api/bill?tender_id=TND-001&bill_id=CB/25-26/0001`

Bill details with **items where `current_qty = 0` excluded** — useful for display tables. All totals remain unchanged.

---

### PATCH `/api/approve/:id`

Approve a bill and post a receivable entry to the client ledger.

**Auth:** `verifyJWT` required

**Allowed transitions:** `Draft` / `Submitted` / `Checked` → `Approved`

---

## CSV Format

| Column | Required | Notes |
|---|---|---|
| `Code` | Yes | Must match bid item codes |
| `Description` | Yes | Item description |
| `Unit` | No | Unit of measurement |
| `Quantity` | Yes | Current bill quantity |
| `Mbook` | No | Measurement Book reference |

Measurement sub-rows (no code) are aggregated into the parent item's quantity automatically.

---

## Computed Fields (pre-save)

All fields below are auto-calculated on every save — do not set manually:

| Field | Formula |
|---|---|
| `current_amount` | `current_qty × rate` |
| `prev_bill_amount` | `prev_bill_qty × rate` |
| `upto_date_qty` | `current_qty + prev_bill_qty` |
| `upto_date_amount` | `upto_date_qty × rate` |
| `excess_qty` / `balance_qty` | vs `agreement_qty` |
| `grand_total` | Sum of all `current_amount` |
| `cgst_amt` / `sgst_amt` / `igst_amt` | `grand_total × pct / 100` |
| `total_tax` | Sum of GST amounts |
| `retention_amount` | `grand_total × retention_pct / 100` |
| `total_deductions` | Sum of deductions array |
| `net_amount` | `grand_total + total_tax - retention - deductions` |
| `balance_due` | `net_amount - amount_received` |
