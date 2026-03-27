# Credit Note — API Reference

**Base URL:** `/creditnote`
**Module:** `finance → creditnote`
**Auth:** JWT cookie or `Authorization: Bearer <token>`

---

## Overview

A Credit Note (CN) is a voucher that **reduces the outstanding payable** to a supplier.
Suppliers can be **Vendors** (material supply) or **Contractors** (labour/work).

**Common triggers:**
- Vendor returns excess / damaged material
- Vendor overcharged on a purchase bill
- Post-invoice discount granted by supplier
- Short supply — less delivered than billed

On **approval**, one `LedgerEntry` row is posted **per `entries[]` line** (each Dr/Cr side of the voucher).
If `entries` is empty, a single header-level `Dr` entry is posted for `amount` as fallback.

---

## 1. Get Next CN Number

Returns the `cn_no` to assign to the next credit note. Call before opening the Create form.

```
GET /creditnote/next-no
```

**Auth required:** `finance > creditnote > read`

### Success Response `200`

```json
{
  "status":   true,
  "cn_no":    "CN/25-26/0001",
  "is_first": true
}
```

| Field | Description |
|---|---|
| `cn_no` | Next CN number — use this in the create payload |
| `is_first` | `true` if no CNs exist yet in this financial year |

> Format: `CN/<FY>/<seq>` — FY resets every April 1. Read-only preview — does not reserve anything.

---

## 2. List Credit Notes

Filtered list of all credit notes. All query params are optional and combinable.

```
GET /creditnote/list
```

### Query Parameters

| Param | Type | Description |
|---|---|---|
| `supplier_type` | `"Vendor" \| "Contractor"` | Filter by supplier type |
| `supplier_id` | `string` | Exact match — e.g. `VND-002` |
| `tender_id` | `string` | Exact match — e.g. `TND-001` |
| `status` | `"draft" \| "pending" \| "approved"` | Lifecycle status |
| `adj_type` | `string` | `Against Bill` / `Advance Adjustment` / `On Account` |
| `tax_type` | `string` | `GST` / `NonGST` / `Exempt` |
| `cn_no` | `string` | Exact match |
| `from_date` | `YYYY-MM-DD` | `cn_date ≥ from_date` |
| `to_date` | `YYYY-MM-DD` | `cn_date ≤ to_date` |
| `page` | `number` | Page number (1-based). Default: `1` |
| `limit` | `number` | Records per page. Default: `20` |

### Example Requests

```
GET /creditnote/list
GET /creditnote/list?supplier_type=Vendor&status=pending
GET /creditnote/list?tender_id=TND-001&from_date=2025-04-01&to_date=2026-03-31
GET /creditnote/list?page=2&limit=10
```

### Success Response `200`

```json
{
  "status": true,
  "data": [
    {
      "_id":           "67a1b2c3d4e5f6a7b8c9d0e1",
      "cn_no":         "CN/25-26/0001",
      "cn_date":       "2026-03-15T00:00:00.000Z",
      "document_year": "25-26",
      "reference_no":  "VND-CN-0042",
      "supplier_type": "Vendor",
      "supplier_id":   "VND-002",
      "supplier_name": "ABC Suppliers Pvt Ltd",
      "tender_id":     "TND-001",
      "tender_name":   "INFRA Road Project Phase 1",
      "bill_no":       "PB/25-26/0001",
      "amount":        1416,
      "round_off":     0,
      "adj_type":      "Against Bill",
      "tax_type":      "GST",
      "status":        "pending",
      "narration":     "3 bags cement returned — damaged",
      "createdAt":     "2026-03-15T10:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 35,
    "pages": 2
  }
}
```

---

## 3. Credit Notes by Supplier

All credit notes for a specific supplier.

```
GET /creditnote/by-supplier/:supplierId
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
GET /creditnote/by-supplier/VND-002
GET /creditnote/by-supplier/CON-001?supplier_type=Contractor&status=approved
```

---

## 4. Credit Notes by Tender

All credit notes for a specific tender.

```
GET /creditnote/by-tender/:tenderId
```

### Query Parameters

| Param | Type | Description |
|---|---|---|
| `supplier_id` | `string` | Filter to one supplier |
| `supplier_type` | `"Vendor" \| "Contractor"` | Filter by type |
| `status` | `string` | Filter by status |

### Example Requests

```
GET /creditnote/by-tender/TND-001
GET /creditnote/by-tender/TND-001?supplier_type=Vendor&status=approved
```

---

## 5. Create Credit Note

Creates a new credit note. Supplier name, GSTIN, and ref are **auto-filled** from the master using `supplier_id` + `supplier_type`.
`bill_ref` (ObjectId) is **auto-resolved** from `bill_no` — no need to send it.

```
POST /creditnote/create
Content-Type: application/json
```

### Request Body

```json
{
  "cn_no":          "CN/25-26/0001",
  "cn_date":        "2026-03-27",

  "reference_no":   "REF-001",
  "reference_date": "2026-03-20",
  "location":       "Mumbai, Maharashtra",

  "sales_type":     "Local",
  "adj_type":       "Against Bill",
  "tax_type":       "GST",
  "gst_percent":    18,
  "rev_charge":     false,

  "supplier_type":  "Vendor",
  "supplier_id":    "V-0012",
  "tender_id":      "TND-2025-001",
  "tender_ref":     "<mongo _id of tender>",
  "tender_name":    "Highway Project Phase 1",

  "bill_no":        "PB/25-26/0043",

  "round_off":      0.50,
  "amount":         25000.00,

  "entries": [
    { "dr_cr": "Cr", "account_name": "V-0012 – ABC Suppliers", "debit_amt": 0,     "credit_amt": 25000 },
    { "dr_cr": "Dr", "account_name": "Cement OPC 53 Grade",    "debit_amt": 25000, "credit_amt": 0 }
  ],

  "narration": "3 bags cement returned — damaged on delivery",
  "status":    "pending"
}
```

### Request Fields

#### Top-level

| Field | Type | Required | Description |
|---|---|---|---|
| `cn_no` | `string` | **Yes** | From `GET /creditnote/next-no` |
| `cn_date` | `date` | No | Defaults to today |
| `document_year` | `string` | No | e.g. `"25-26"` — defaults to current FY |
| `reference_no` | `string` | No | Supplier's own CN reference |
| `reference_date` | `date` | No | Date on supplier's CN document |
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
| `round_off` | `number` | No | Rounding difference (max ±₹1). `0` when Dr/Cr sides balance exactly |
| `taxable_amount` | `number` | No | Base amount before GST. Defaults to `amount` |
| `cgst_amt` | — | — | **Server-computed** by pre-save hook — do not send |
| `sgst_amt` | — | — | **Server-computed** by pre-save hook — do not send |
| `igst_amt` | — | — | **Server-computed** by pre-save hook — do not send |
| `total_tax` | — | — | **Server-computed** by pre-save hook — do not send |
| `narration` | `string` | No | Free text note |
| `status` | `string` | No | `draft` / `pending` (default). Use `approved` to auto-post ledger on create |

> **GST hook:** When `taxable_amount > 0` and any GST % is set, server computes `cgst_amt`, `sgst_amt`, `igst_amt`, `total_tax`, and overrides `amount = taxable_amount + total_tax`.

#### `entries[]` — minimum 1 required

| Field | Type | Required | Description |
|---|---|---|---|
| `dr_cr` | `"Dr" \| "Cr"` | **Yes** | Entry side |
| `account_name` | `string` | **Yes** | Ledger account head (supplier row or material/expense row) |
| `debit_amt` | `number` | **Yes** | Amount on debit side (`0` when side is Cr) |
| `credit_amt` | `number` | **Yes** | Amount on credit side (`0` when side is Dr) |

**CN voucher convention (FE-enforced):**
- Supplier row → `dr_cr: "Cr"` (auto-set, locked)
- Material / expense rows → `dr_cr: "Dr"` (user-editable)
- `|Σ debit_amt − Σ credit_amt| ≤ ₹1` — excess goes into `round_off`

### Side Effects on Approval

When `status` becomes `"approved"` (via create or `PATCH /approve`):
- **One `LedgerEntry` is posted per `entries[]` row** — each row's `debit_amt` / `credit_amt` is written as-is
- First entry row holds the `vch_ref` (CN `_id`) for dedup protection; subsequent rows use `null` (sparse index permits)
- If `entries` is empty, a single fallback `Dr` entry is posted for `amount`
- Supplier's outstanding balance in the ledger reflects all rows combined

### Success Response `201`

```json
{
  "status":  true,
  "message": "Credit note created",
  "data": {
    "cn_no":          "CN/25-26/0001",
    "cn_date":        "2026-03-27T00:00:00.000Z",
    "supplier_type":  "Vendor",
    "supplier_id":    "V-0012",
    "supplier_name":  "ABC Suppliers Pvt Ltd",
    "supplier_gstin": "27AABCU9603R1ZX",
    "bill_no":        "PB/25-26/0043",
    "bill_ref":       "67a1b2c3d4e5f6a7b8c9d0e4",
    "amount":         25000,
    "round_off":      0.5,
    "taxable_amount": 25000,
    "cgst_pct": 9, "cgst_amt": 0,
    "sgst_pct": 9, "sgst_amt": 0,
    "igst_pct": 0, "igst_amt": 0,
    "total_tax": 0,
    "status":         "pending",
    "entries": [
      { "dr_cr": "Cr", "account_name": "V-0012 – ABC Suppliers", "debit_amt": 0,     "credit_amt": 25000 },
      { "dr_cr": "Dr", "account_name": "Cement OPC 53 Grade",    "debit_amt": 25000, "credit_amt": 0 }
    ],
    "createdAt": "2026-03-27T10:00:00.000Z"
  }
}
```

### Error Responses

| Status | Condition | Message |
|---|---|---|
| `400` | `cn_no` missing | `"cn_no is required"` |
| `400` | `supplier_id` missing | `"supplier_id is required"` |
| `400` | `supplier_type` missing | `"supplier_type is required"` |
| `400` | Vendor not found | `"Vendor 'V-XXX' not found"` |
| `400` | Contractor not found | `"Contractor 'C-XXX' not found"` |
| `400` | Invalid supplier_type | `"Invalid supplier_type '...'. Must be Vendor or Contractor"` |
| `400` | Entries don't balance | `"Entry lines do not balance: total debits (...) ≠ total credits (...)"` |
| `400` | No entries | `"A credit note must have at least one entry line"` |
| `500` | DB / duplicate cn_no | `error.message` |

---

## 6. Approve Credit Note

Moves a `pending` credit note to `approved` and posts ledger entries.

```
PATCH /creditnote/approve/:id
```

**Auth required:** `finance > creditnote > edit`

### Example Request

```
PATCH /creditnote/approve/67a1b2c3d4e5f6a7b8c9d0e1
```

### Success Response `200`

```json
{
  "status":  true,
  "message": "Credit note approved",
  "data": {
    "cn_no":   "CN/25-26/0001",
    "status":  "approved",
    "amount":  25000
  }
}
```

### Error Responses

| Status | Condition | Message |
|---|---|---|
| `400` | ID not found | `"Credit note not found"` |
| `400` | Already approved | `"Already approved"` |

---

## 7. Get Credit Note by ID

```
GET /creditnote/:id
```

Returns the full credit note document.

### Success Response `200`

```json
{
  "status": true,
  "data": { "...full CN fields..." }
}
```

### Error Responses

| Status | Condition | Message |
|---|---|---|
| `404` | `id` not found | `"Credit note not found"` |

---

## 8. Update Credit Note

```
PATCH /creditnote/update/:id
Content-Type: application/json
```

Only `draft` or `pending` CNs can be updated. Approved CNs are blocked.

**Updatable fields:** `cn_date`, `reference_no`, `reference_date`, `location`, `sales_type`, `adj_type`, `tax_type`, `rev_charge`, `tender_id`, `tender_ref`, `tender_name`, `bill_ref`, `bill_no`, `amount`, `entries`, `narration`

> If `entries[]` is sent, the **entire entries array is replaced**.

### Success Response `200`

```json
{
  "status": true,
  "message": "Credit note updated",
  "data": { "...updated CN fields..." }
}
```

### Error Responses

| Status | Condition | Message |
|---|---|---|
| `400` | CN is approved | `"Cannot edit an approved credit note"` |
| `400` | `id` not found | `"Credit note not found"` |

---

## 9. Delete Credit Note

```
DELETE /creditnote/delete/:id
```

Only `draft` or `pending` CNs can be deleted. Approved CNs are blocked.

### Success Response `200`

```json
{
  "status": true,
  "message": "Credit note deleted",
  "data": { "deleted": true, "cn_no": "CN/25-26/0001" }
}
```

### Error Responses

| Status | Condition | Message |
|---|---|---|
| `400` | CN is approved | `"Cannot delete an approved credit note"` |
| `400` | `id` not found | `"Credit note not found"` |

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
1. Open Create CN form
   GET /creditnote/next-no              → pre-fill CN number

2. Select Supplier + Tender
   GET /finance/payable-bills?supplier_id=V-0012&supplier_type=Vendor&tender_id=TND-001
                                        → pick linked bill (bill_no saved; bill_ref auto-resolved on create)

3. Fill entries (Dr/Cr lines), round_off, narration
   Supplier row is auto-set to Cr; material rows are Dr.
   FE validates |ΣDr − ΣCr| ≤ ₹1; excess goes in round_off.

4. POST /creditnote/create              → saved as "pending"
   Server: auto-fills supplier, resolves bill_ref, splits gst_percent, computes tax amounts

5. Finance manager approves
   PATCH /creditnote/approve/:id        → status = "approved"
                                        → one LedgerEntry posted per entries[] row
                                        → supplier balance updated
```

---

## Model Fields Reference

| Field | Type | Description |
|---|---|---|
| `cn_no` | `String` | Unique — `CN/25-26/XXXX` |
| `cn_date` | `Date` | Note date |
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
| `round_off` | `Number` | Rounding diff (max ±₹1) |
| `taxable_amount` | `Number` | Base before GST |
| `cgst_pct` / `cgst_amt` | `Number` | CGST rate and computed amount |
| `sgst_pct` / `sgst_amt` | `Number` | SGST rate and computed amount |
| `igst_pct` / `igst_amt` | `Number` | IGST rate and computed amount |
| `total_tax` | `Number` | `cgst_amt + sgst_amt + igst_amt` |
| `entries` | `Array` | Voucher Dr/Cr lines |
| `narration` | `String` | Free text |
| `status` | `String` | `draft` / `pending` / `approved` |
