# Debit Note — API Reference

**Base URL:** `/debitnote`
**Module:** `finance → debitnote`
**Auth:** JWT cookie or `Authorization: Bearer <token>`

---

## Overview

A Debit Note (DN) is a voucher that **reduces the outstanding payable** to a supplier by recording a claim or deduction.
Suppliers can be **Vendors** (material supply) or **Contractors** (labour/work).

**Common triggers:**
- Penalty for delayed supply or poor workmanship
- Price difference — supplier billed higher than agreed PO/WO rate
- Short supply deduction
- Quality rejection at site

On **approval**, one `LedgerEntry` row is posted **per `entries[]` line** (each Dr/Cr side of the voucher).
If `entries` is empty, a single header-level `Dr` entry is posted for `amount` as fallback.

> **DN vs CN:** Both reduce payable. CN is typically initiated by the supplier (they issue it to you). DN is typically initiated by you (you raise it against the supplier). Both have the same ledger effect.

---

## 1. Get Next DN Number

Returns the `dn_no` to assign to the next debit note. Call before opening the Create form.

```
GET /debitnote/next-no
```

**Auth required:** `finance > debitnote > read`

### Success Response `200`

```json
{
  "status":   true,
  "dn_no":    "DN/25-26/0001",
  "is_first": true
}
```

| Field | Description |
|---|---|
| `dn_no` | Next DN number — use this in the create payload |
| `is_first` | `true` if no DNs exist yet in this financial year |

> Format: `DN/<FY>/<seq>` — FY resets every April 1. Read-only preview — does not reserve anything.

---

## 2. List Debit Notes

Filtered list of all debit notes. All query params are optional and combinable.

```
GET /debitnote/list
```

### Query Parameters

| Param | Type | Description |
|---|---|---|
| `supplier_type` | `"Vendor" \| "Contractor"` | Filter by supplier type |
| `supplier_id` | `string` | Exact match — e.g. `CON-001` |
| `tender_id` | `string` | Exact match — e.g. `TND-001` |
| `status` | `"draft" \| "pending" \| "approved"` | Lifecycle status |
| `adj_type` | `string` | `Against Bill` / `Advance Adjustment` / `On Account` |
| `tax_type` | `string` | `GST` / `NonGST` / `Exempt` |
| `dn_no` | `string` | Exact match |
| `from_date` | `YYYY-MM-DD` | `dn_date ≥ from_date` |
| `to_date` | `YYYY-MM-DD` | `dn_date ≤ to_date` |
| `page` | `number` | Page number (1-based). Default: `1` |
| `limit` | `number` | Records per page. Default: `20` |

### Example Requests

```
GET /debitnote/list
GET /debitnote/list?supplier_type=Contractor&status=pending
GET /debitnote/list?tender_id=TND-001&from_date=2025-04-01&to_date=2026-03-31
GET /debitnote/list?page=2&limit=10
```

### Success Response `200`

```json
{
  "status": true,
  "data": [
    {
      "_id":           "67a1b2c3d4e5f6a7b8c9d0f1",
      "dn_no":         "DN/25-26/0001",
      "dn_date":       "2026-03-27T00:00:00.000Z",
      "document_year": "25-26",
      "reference_no":  "",
      "supplier_type": "Contractor",
      "supplier_id":   "C-0004",
      "supplier_name": "XYZ Contractors",
      "tender_id":     "TND-2025-001",
      "tender_name":   "Highway Project Phase 1",
      "bill_no":       "WB/25-26/0012",
      "amount":        12500,
      "service_amt":   5000,
      "round_off":     0,
      "adj_type":      "Against Bill",
      "tax_type":      "GST",
      "status":        "pending",
      "narration":     "Penalty for 5-day delay in supply @ ₹2500/day",
      "createdAt":     "2026-03-27T09:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 18,
    "pages": 1
  }
}
```

---

## 3. Debit Notes by Supplier

All debit notes for a specific supplier.

```
GET /debitnote/by-supplier/:supplierId
```

### Query Parameters

| Param | Type | Description |
|---|---|---|
| `supplier_type` | `"Vendor" \| "Contractor"` | Required if same ID exists in both |
| `status` | `string` | Filter by status |
| `from_date` | `YYYY-MM-DD` | Date range start |
| `to_date` | `YYYY-MM-DD` | Date range end |

### Example Requests

```
GET /debitnote/by-supplier/CON-001
GET /debitnote/by-supplier/CON-001?supplier_type=Contractor&status=approved
GET /debitnote/by-supplier/VND-002?from_date=2025-04-01
```

---

## 4. Debit Notes by Tender

All debit notes for a specific tender.

```
GET /debitnote/by-tender/:tenderId
```

### Query Parameters

| Param | Type | Description |
|---|---|---|
| `supplier_id` | `string` | Filter to one supplier |
| `supplier_type` | `"Vendor" \| "Contractor"` | Filter by type |
| `status` | `string` | Filter by status |

### Example Requests

```
GET /debitnote/by-tender/TND-001
GET /debitnote/by-tender/TND-001?supplier_type=Contractor
GET /debitnote/by-tender/TND-001?supplier_id=CON-001&status=approved
```

---

## 5. Create Debit Note

Creates a new debit note. Supplier name, GSTIN, and ref are **auto-filled** from the master using `supplier_id` + `supplier_type`.
`bill_ref` (ObjectId) is **auto-resolved** from `bill_no` — no need to send it.

```
POST /debitnote/create
Content-Type: application/json
```

### Request Body

```json
{
  "dn_no":          "DN/25-26/0001",
  "dn_date":        "2026-03-27",
  "service_amt":    5000.00,

  "reference_no":   "REF-002",
  "reference_date": "2026-03-20",
  "location":       "Mumbai, Maharashtra",

  "sales_type":     "Local",
  "adj_type":       "Against Bill",
  "tax_type":       "GST",
  "gst_percent":    18,
  "rev_charge":     false,

  "supplier_type":  "Contractor",
  "supplier_id":    "C-0004",
  "tender_id":      "TND-2025-001",
  "tender_ref":     "<mongo _id of tender>",
  "tender_name":    "Highway Project Phase 1",

  "bill_no":        "WB/25-26/0012",

  "round_off":      0,
  "amount":         12500.00,

  "entries": [
    { "dr_cr": "Dr", "account_name": "C-0004 – XYZ Contractors", "debit_amt": 12500, "credit_amt": 0 },
    { "dr_cr": "Cr", "account_name": "Steel TMT 500D 12mm",       "debit_amt": 0,    "credit_amt": 12500 }
  ],

  "narration": "Penalty for 5-day delay in supply @ ₹2500/day",
  "status":    "pending"
}
```

### Request Fields

#### Top-level

| Field | Type | Required | Description |
|---|---|---|---|
| `dn_no` | `string` | **Yes** | From `GET /debitnote/next-no` |
| `dn_date` | `date` | No | Defaults to today |
| `document_year` | `string` | No | e.g. `"25-26"` — defaults to current FY |
| `reference_no` | `string` | No | Supplier's own DN reference (if any) |
| `reference_date` | `date` | No | Date on supplier's document |
| `location` | `string` | No | Branch / site location |
| `sales_type` | `string` | No | `Local` / `Interstate` / `Export` / `SEZ` / `Exempt` |
| `adj_type` | `string` | No | `Against Bill` / `Advance Adjustment` / `On Account` |
| `tax_type` | `string` | No | `GST` / `NonGST` / `Exempt` |
| `gst_percent` | `number` | No | **Shorthand GST rate.** For `Local` → splits into `cgst_pct = gst_percent/2`, `sgst_pct = gst_percent/2`. For `Interstate` → sets `igst_pct = gst_percent`. Ignored if explicit `cgst_pct`/`sgst_pct`/`igst_pct` are sent |
| `cgst_pct` | `number` | No | CGST rate % — overrides `gst_percent` if provided |
| `sgst_pct` | `number` | No | SGST rate % — overrides `gst_percent` if provided |
| `igst_pct` | `number` | No | IGST rate % — overrides `gst_percent` if provided |
| `rev_charge` | `boolean` | No | Reverse Charge Mechanism — default `false` |
| `supplier_type` | `"Vendor" \| "Contractor"` | **Yes** | Type of supplier |
| `supplier_id` | `string` | **Yes** | Business key — used to auto-fill all supplier fields |
| `supplier_ref` | — | — | **Auto-filled** — do not send |
| `supplier_name` | — | — | **Auto-filled** from master — do not send |
| `supplier_gstin` | — | — | **Auto-filled** from master — do not send |
| `tender_id` | `string` | No | Tender business key |
| `tender_ref` | `ObjectId` | No | Tender `_id` |
| `tender_name` | `string` | No | Snapshot |
| `bill_no` | `string` | No | Bill number — **auto-resolves `bill_ref`** (looks up PurchaseBill `doc_id` for Vendor, WeeklyBilling `bill_no` for Contractor) |
| `bill_ref` | `ObjectId` | No | Optional explicit bill `_id` — skipped if `bill_no` is sent |
| `amount` | `number` | **Yes** | Total note value (gross). **Auto-recomputed** by pre-save hook when `taxable_amount + gst` fields are set |
| `service_amt` | `number` | No | Service portion of the amount (DN-specific) |
| `round_off` | `number` | No | Rounding difference (max ±₹1). `0` when Dr/Cr sides balance exactly |
| `taxable_amount` | `number` | No | Base amount before GST. Defaults to `amount` |
| `cgst_amt` | — | — | **Server-computed** by pre-save hook — do not send |
| `sgst_amt` | — | — | **Server-computed** by pre-save hook — do not send |
| `igst_amt` | — | — | **Server-computed** by pre-save hook — do not send |
| `total_tax` | — | — | **Server-computed** by pre-save hook — do not send |
| `narration` | `string` | No | Free text — describe the reason for the deduction |
| `status` | `string` | No | `draft` / `pending` (default). Use `approved` to auto-post ledger on create |

> **GST hook:** When `taxable_amount > 0` and any GST % is set, server computes `cgst_amt`, `sgst_amt`, `igst_amt`, `total_tax`, and overrides `amount = taxable_amount + total_tax`.

#### `entries[]` — minimum 1 required

| Field | Type | Required | Description |
|---|---|---|---|
| `dr_cr` | `"Dr" \| "Cr"` | **Yes** | Entry side |
| `account_name` | `string` | **Yes** | Ledger account head (supplier row or material/expense row) |
| `debit_amt` | `number` | **Yes** | Amount on debit side (`0` when side is Cr) |
| `credit_amt` | `number` | **Yes** | Amount on credit side (`0` when side is Dr) |

**DN voucher convention (FE-enforced):**
- Supplier row → `dr_cr: "Dr"` (auto-set, locked)
- Material / expense rows → `dr_cr: "Cr"` (user-editable)
- `|Σ debit_amt − Σ credit_amt| ≤ ₹1` — excess goes into `round_off`

### Side Effects on Approval

When `status` becomes `"approved"` (via create or `PATCH /approve`):
- **One `LedgerEntry` is posted per `entries[]` row** — each row's `debit_amt` / `credit_amt` is written as-is
- First entry row holds the `vch_ref` (DN `_id`) for dedup protection; subsequent rows use `null` (sparse index permits)
- If `entries` is empty, a single fallback `Dr` entry is posted for `amount`
- Supplier's outstanding balance in the ledger reflects all rows combined

### Success Response `201`

```json
{
  "status":  true,
  "message": "Debit note created",
  "data": {
    "dn_no":          "DN/25-26/0001",
    "dn_date":        "2026-03-27T00:00:00.000Z",
    "supplier_type":  "Contractor",
    "supplier_id":    "C-0004",
    "supplier_name":  "XYZ Contractors",
    "supplier_gstin": "29AABCK1234R1ZX",
    "bill_no":        "WB/25-26/0012",
    "bill_ref":       "67a1b2c3d4e5f6a7b8c9d0e5",
    "amount":         12500,
    "service_amt":    5000,
    "round_off":      0,
    "taxable_amount": 12500,
    "cgst_pct": 9, "cgst_amt": 0,
    "sgst_pct": 9, "sgst_amt": 0,
    "igst_pct": 0, "igst_amt": 0,
    "total_tax": 0,
    "status":         "pending",
    "entries": [
      { "dr_cr": "Dr", "account_name": "C-0004 – XYZ Contractors", "debit_amt": 12500, "credit_amt": 0 },
      { "dr_cr": "Cr", "account_name": "Steel TMT 500D 12mm",       "debit_amt": 0,    "credit_amt": 12500 }
    ],
    "createdAt": "2026-03-27T09:00:00.000Z"
  }
}
```

### Error Responses

| Status | Condition | Message |
|---|---|---|
| `400` | `dn_no` missing | `"dn_no is required"` |
| `400` | `supplier_id` missing | `"supplier_id is required"` |
| `400` | `supplier_type` missing | `"supplier_type is required"` |
| `400` | Vendor not found | `"Vendor 'V-XXX' not found"` |
| `400` | Contractor not found | `"Contractor 'C-XXX' not found"` |
| `400` | Invalid supplier_type | `"Invalid supplier_type '...'. Must be Vendor or Contractor"` |
| `400` | Entries don't balance | `"Entry lines do not balance: total debits (...) ≠ total credits (...)"` |
| `400` | No entries | `"A debit note must have at least one entry line"` |
| `500` | DB / duplicate dn_no | `error.message` |

---

## 6. Approve Debit Note

Moves a `pending` debit note to `approved` and posts ledger entries.

```
PATCH /debitnote/approve/:id
```

**Auth required:** `finance > debitnote > edit`

### Example Request

```
PATCH /debitnote/approve/67a1b2c3d4e5f6a7b8c9d0f1
```

### Success Response `200`

```json
{
  "status":  true,
  "message": "Debit note approved",
  "data": {
    "dn_no":   "DN/25-26/0001",
    "status":  "approved",
    "amount":  12500
  }
}
```

### Error Responses

| Status | Condition | Message |
|---|---|---|
| `400` | ID not found | `"Debit note not found"` |
| `400` | Already approved | `"Already approved"` |

---

## 7. Get Debit Note by ID

```
GET /debitnote/:id
```

Returns the full debit note document.

### Success Response `200`

```json
{
  "status": true,
  "data": { "...full DN fields..." }
}
```

### Error Responses

| Status | Condition | Message |
|---|---|---|
| `404` | `id` not found | `"Debit note not found"` |

---

## 8. Update Debit Note

```
PATCH /debitnote/update/:id
Content-Type: application/json
```

Only `draft` or `pending` DNs can be updated. Approved DNs are blocked.

**Updatable fields:** `dn_date`, `reference_no`, `reference_date`, `location`, `sales_type`, `adj_type`, `tax_type`, `rev_charge`, `tender_id`, `tender_ref`, `tender_name`, `bill_ref`, `bill_no`, `amount`, `service_amt`, `entries`, `narration`

> If `entries[]` is sent, the **entire entries array is replaced**.

### Success Response `200`

```json
{
  "status": true,
  "message": "Debit note updated",
  "data": { "...updated DN fields..." }
}
```

### Error Responses

| Status | Condition | Message |
|---|---|---|
| `400` | DN is approved | `"Cannot edit an approved debit note"` |
| `400` | `id` not found | `"Debit note not found"` |

---

## 9. Delete Debit Note

```
DELETE /debitnote/delete/:id
```

Only `draft` or `pending` DNs can be deleted. Approved DNs are blocked.

### Success Response `200`

```json
{
  "status": true,
  "message": "Debit note deleted",
  "data": { "deleted": true, "dn_no": "DN/25-26/0001" }
}
```

### Error Responses

| Status | Condition | Message |
|---|---|---|
| `400` | DN is approved | `"Cannot delete an approved debit note"` |
| `400` | `id` not found | `"Debit note not found"` |

---

## Related Endpoints

| Hook | Endpoint | Notes |
|---|---|---|
| Tender dropdown | `GET /tender/gettendersid` | Returns `tender_id`, `tender_project_name`, `tender_location` |
| Vendor list | `GET /permittedvendor/getvendor/:tenderId` | Returns permitted vendors for a tender |
| Contractor list | `GET /contractor/getbytender/:tenderId` | Returns contractors for a tender |
| Payable bills | `GET /finance/payable-bills?supplier_id=&supplier_type=&tender_id=` | Unpaid/partial bills for the linked-bill selector |
| Material list | `GET /material/list/:tenderId` | Material descriptions for voucher entry dropdown |

---

## Workflow

```
1. Open Create DN form
   GET /debitnote/next-no               → pre-fill DN number

2. Select Supplier + Tender
   GET /finance/payable-bills?supplier_id=C-0004&supplier_type=Contractor&tender_id=TND-001
                                        → pick linked bill (bill_no saved; bill_ref auto-resolved on create)

3. Fill entries (Dr/Cr lines), service_amt, round_off, narration
   Supplier row is auto-set to Dr; material/penalty rows are Cr.
   FE validates |ΣDr − ΣCr| ≤ ₹1; excess goes in round_off.

4. POST /debitnote/create               → saved as "pending"
   Server: auto-fills supplier, resolves bill_ref, splits gst_percent, computes tax amounts

5. Finance manager approves
   PATCH /debitnote/approve/:id         → status = "approved"
                                        → one LedgerEntry posted per entries[] row
                                        → supplier balance updated
```

---

## CN vs DN — Quick Reference

| | Credit Note | Debit Note |
|---|---|---|
| **Endpoint prefix** | `/creditnote` | `/debitnote` |
| **Doc number** | `CN/25-26/XXXX` | `DN/25-26/XXXX` |
| **Initiated by** | Supplier (sends to you) | You (raise against supplier) |
| **Common reason** | Material return, overbilling | Penalty, price diff, short supply |
| **Extra field** | — | `service_amt` |
| **Supplier row** | Auto-set `Cr` (FE-locked) | Auto-set `Dr` (FE-locked) |
| **Material rows** | `Dr` (user-editable) | `Cr` (user-editable) |
| **Ledger effect** | One entry per row posted | One entry per row posted |

---

## Model Fields Reference

| Field | Type | Description |
|---|---|---|
| `dn_no` | `String` | Unique — `DN/25-26/XXXX` |
| `dn_date` | `Date` | Note date |
| `document_year` | `String` | FY label e.g. `"25-26"` |
| `reference_no` | `String` | Supplier's own reference |
| `reference_date` | `Date` | Date on supplier's document |
| `location` | `String` | Branch / site |
| `sales_type` | `String` | `Local` / `Interstate` / `Export` / `SEZ` / `Exempt` |
| `adj_type` | `String` | `Against Bill` / `Advance Adjustment` / `On Account` |
| `tax_type` | `String` | `GST` / `NonGST` / `Exempt` |
| `rev_charge` | `Boolean` | Reverse charge flag |
| `supplier_type` | `String` | `Vendor` / `Contractor` |
| `supplier_id` | `String` | Business key |
| `supplier_ref` | `ObjectId` | Vendor/Contractor `_id` |
| `supplier_name` | `String` | Snapshot |
| `supplier_gstin` | `String` | Snapshot |
| `tender_id` | `String` | Tender business key |
| `tender_ref` | `ObjectId` | Tenders `_id` |
| `tender_name` | `String` | Snapshot |
| `bill_ref` | `ObjectId` | PurchaseBill or WeeklyBilling `_id` |
| `bill_no` | `String` | Snapshot of bill number |
| `amount` | `Number` | Gross total |
| `service_amt` | `Number` | Service portion (DN-specific) |
| `round_off` | `Number` | Rounding diff (max ±₹1) |
| `taxable_amount` | `Number` | Base before GST |
| `cgst_pct` / `cgst_amt` | `Number` | CGST rate and computed amount |
| `sgst_pct` / `sgst_amt` | `Number` | SGST rate and computed amount |
| `igst_pct` / `igst_amt` | `Number` | IGST rate and computed amount |
| `total_tax` | `Number` | `cgst_amt + sgst_amt + igst_amt` |
| `entries` | `Array` | Voucher Dr/Cr lines |
| `narration` | `String` | Free text |
| `status` | `String` | `draft` / `pending` / `approved` |
