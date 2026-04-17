# Purchase Bill — API Reference

**Base URL:** `/purchasebill`
**Module:** `finance → purchasebill`
**Auth:** JWT cookie or `Authorization: Bearer <token>`

---

## 1. Get Next Bill ID

Returns the `doc_id` that will be assigned to the next bill. Call this before opening the Create Bill form to pre-fill the bill number.

```
GET /purchasebill/next-id
```

**Auth required:** `finance > purchasebill > read`
**Query params:** None

### Success Response `200`

```json
{
  "status": true,
  "doc_id": "PB/25-26/0001",
  "is_first": true
}
```

| Field | Type | Description |
|---|---|---|
| `doc_id` | `string` | Next bill ID to use in the create payload |
| `is_first` | `boolean` | `true` if no bills exist yet in this financial year |

### Notes
- Sequence is **global per financial year** — not per tender
- Format: `PB/<FY>/<seq>` where FY resets every April 1
- This is a **read-only preview** — calling it does not reserve or create anything
- Always call this immediately before submitting the create form to avoid stale IDs

---

## 2. List Purchase Bills

Returns a filtered, pageable list of bills. All query params are optional and combinable.
Heavy arrays (`line_items`, `tax_groups`, `additional_charges`) are **excluded** from this response — use the detail endpoint for those.

```
GET /purchasebill/list
```

**Auth required:** `finance > purchasebill > read`

### Query Parameters

| Param | Type | Description |
|---|---|---|
| `from_date` | `YYYY-MM-DD` | `doc_date ≥ from_date` (time set to 00:00:00) |
| `to_date` | `YYYY-MM-DD` | `doc_date ≤ to_date` (time set to 23:59:59) |
| `doc_id` | `string` | Exact match — e.g. `PB/25-26/0001` |
| `tender_id` | `string` | Exact match — e.g. `TND-001` |
| `vendor_id` | `string` | Exact match — e.g. `VND-002` |
| `tax_mode` | `"instate" \| "otherstate"` | Exact match |
| `invoice_no` | `string` | Case-insensitive partial match |
| `status` | `"draft" \| "pending" \| "approved"` | Exact match |
| `page` | `number` | Page number (1-based). Default: `1` |
| `limit` | `number` | Records per page. Default: `20` |

### Response Fields

Each record contains only summary fields:

| Field | Type | Description |
|---|---|---|
| `doc_id` | `string` | Bill system ID |
| `doc_date` | `date` | Bill date |
| `invoice_no` | `string` | Vendor invoice number |
| `invoice_date` | `date` | Vendor invoice date |
| `due_date` | `date` | `doc_date + credit_days` |
| `credit_days` | `number` | Payment credit period |
| `tender_id` | `string` | Linked tender ID |
| `tender_name` | `string` | Tender name snapshot |
| `vendor_id` | `string` | Linked vendor ID |
| `vendor_name` | `string` | Vendor name snapshot |
| `vendor_gstin` | `string` | Vendor GSTIN snapshot |
| `place_of_supply` | `string` | `InState` / `Others` |
| `tax_mode` | `string` | `instate` / `otherstate` |
| `grand_total` | `number` | Σ gross amounts (before tax) |
| `total_tax` | `number` | Σ all GST |
| `net_amount` | `number` | Final payable amount (rounded) |
| `round_off` | `number` | Rounding adjustment (±0.99) |
| `status` | `string` | Bill lifecycle status |
| `createdAt` | `date` | Record creation timestamp |

### Example Request

```
GET /purchasebill/list?tender_id=TND-001&from_date=2025-04-01&to_date=2026-03-31&status=pending&page=1&limit=20
```

### Success Response `200`

```json
{
  "status": true,
  "data": [
    {
      "doc_id": "PB/25-26/0001",
      "doc_date": "2026-03-19T00:00:00.000Z",
      "invoice_no": "RA/Q1/04200",
      "invoice_date": "2026-03-15T00:00:00.000Z",
      "due_date": "2026-04-18T00:00:00.000Z",
      "credit_days": 30,
      "tender_id": "TND-001",
      "tender_name": "INFRA Road Project Phase 1",
      "vendor_id": "VND-002",
      "vendor_name": "ABC Suppliers Pvt Ltd",
      "vendor_gstin": "27AABCU9603R1ZX",
      "place_of_supply": "InState",
      "tax_mode": "instate",
      "grand_total": 20000,
      "total_tax": 3600,
      "net_amount": 23990,
      "round_off": 0,
      "status": "pending",
      "createdAt": "2026-03-19T10:30:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 42,
    "pages": 3
  }
}
```

---

## 3. Bills by Tender (Full Detail)

Returns **all bills** for a specific tender with complete details including `line_items`, `tax_groups`, and `additional_charges`. All filters are optional and combinable.

```
GET /purchasebill/by-tender/:tenderId
```

**Auth required:** `finance > purchasebill > read`

### Query Parameters

| Param | Type | Description |
|---|---|---|
| `status` | `string` | `draft` / `pending` / `approved` / `paid` |
| `vendor_id` | `string` | Exact match |
| `tax_mode` | `string` | `instate` / `otherstate` |
| `invoice_no` | `string` | Case-insensitive partial match |
| `from_date` | `YYYY-MM-DD` | `doc_date ≥ from_date` |
| `to_date` | `YYYY-MM-DD` | `doc_date ≤ to_date` |

### Example Requests

```
GET /purchasebill/by-tender/TND-001
GET /purchasebill/by-tender/TND-001?status=pending
GET /purchasebill/by-tender/TND-001?from_date=2025-04-01&to_date=2026-03-31
GET /purchasebill/by-tender/TND-001?vendor_id=VND-002&status=approved
```

### Success Response `200`

```json
{
  "status": true,
  "data": [
    {
      "doc_id": "PB/25-26/0001",
      "doc_date": "2026-03-19T00:00:00.000Z",
      "invoice_no": "RA/Q1/04200",
      "invoice_date": "2026-03-15T00:00:00.000Z",
      "due_date": "2026-04-18T00:00:00.000Z",
      "credit_days": 30,
      "narration": "Purchase for INFRA Project",
      "tender_id": "TND-001",
      "tender_name": "INFRA Road Project Phase 1",
      "vendor_id": "VND-002",
      "vendor_name": "ABC Suppliers Pvt Ltd",
      "vendor_gstin": "27AABCU9603R1ZX",
      "place_of_supply": "InState",
      "tax_mode": "instate",
      "line_items": [
        {
          "grn_no": "GRN-0042",
          "grn_ref": "67a1b2c3d4e5f6a7b8c9d0e3",
          "ref_date": "2026-03-10T00:00:00.000Z",
          "item_description": "Cement OPC 53 Grade",
          "unit": "Bags",
          "accepted_qty": 50,
          "unit_price": 400,
          "gross_amt": 20000,
          "cgst_pct": 9, "cgst_amt": 1800,
          "sgst_pct": 9, "sgst_amt": 1800,
          "igst_pct": 0, "igst_amt": 0,
          "net_amt": 23600
        }
      ],
      "tax_groups": [
        { "cgst_pct": 9, "sgst_pct": 9, "igst_pct": 0, "taxable": 20000, "cgst_amt": 1800, "sgst_amt": 1800, "igst_amt": 0 }
      ],
      "additional_charges": [
        { "type": "Transport", "amount": 500, "gst_pct": 18, "net": 590,  "is_deduction": false },
        { "type": "Discount",  "amount": 200, "gst_pct": 0,  "net": -200, "is_deduction": true }
      ],
      "grand_total": 20000,
      "total_tax": 3600,
      "round_off": 0,
      "net_amount": 23990,
      "status": "pending",
      "createdAt": "2026-03-19T10:30:00.000Z"
    }
  ]
}
```

---

## 4. All Tenders Summary Table

Returns one summary row per tender — designed for the finance overview table showing billing status across all tenders at a glance. Draft bills are excluded from all totals.

```
GET /purchasebill/summary-all
```

**Auth required:** `finance > purchasebill > read`
**Query params:** None

### Example Request

```
GET /purchasebill/summary-all
```

### Success Response `200`

```json
{
  "status": true,
  "data": [
    {
      "tender_id": "TND-001",
      "tender_name": "INFRA Road Project Phase 1",
      "total_bills": 12,
      "total_grand": 240000,
      "total_tax": 43200,
      "total_net": 283990,
      "pending_amount": 70290,
      "approved_amount": 118500,
      "latest_bill_date": "2026-03-19T00:00:00.000Z"
    },
    {
      "tender_id": "TND-002",
      "tender_name": "Bridge Construction Phase 2",
      "total_bills": 5,
      "total_grand": 85000,
      "total_tax": 15300,
      "total_net": 100300,
      "pending_amount": 100300,
      "approved_amount": 0,
      "latest_bill_date": "2026-03-10T00:00:00.000Z"
    }
  ]
}
```

### Response Fields (per row)

| Field | Description |
|---|---|
| `tender_id` | Tender business key |
| `tender_name` | Snapshot of tender name |
| `total_bills` | Total bill count for the tender |
| `total_grand` | Σ `grand_total` (pre-tax) |
| `total_tax` | Σ GST across all bills |
| `total_net` | Σ `net_amount` — total payable |
| `pending_amount` | `net_amount` sum of bills in `pending` status |
| `approved_amount` | `net_amount` sum of bills in `approved` status |
| `latest_bill_date` | Date of the most recent bill |

> Results are sorted by `latest_bill_date` descending (most recently billed tender first).

---

## 6. Tender Billing Summary (Single)

Returns aggregate totals and a status breakdown for all bills under a tender. Use this for the summary card / dashboard panel.

```
GET /purchasebill/summary/:tenderId
```

**Auth required:** `finance > purchasebill > read`
**Query params:** None

### Example Request

```
GET /purchasebill/summary/TND-001
```

### Success Response `200`

```json
{
  "status": true,
  "data": {
    "tender_id": "TND-001",
    "total_bills": 12,
    "total_grand": 240000,
    "total_tax": 43200,
    "total_net": 283990,
    "by_status": [
      { "_id": "approved", "count": 5,  "net_amount": 118500 },
      { "_id": "paid",     "count": 4,  "net_amount": 95200  },
      { "_id": "pending",  "count": 3,  "net_amount": 70290  }
    ],
    "recent": [
      {
        "doc_id": "PB/25-26/0012",
        "doc_date": "2026-03-19T00:00:00.000Z",
        "invoice_no": "RA/Q1/04200",
        "vendor_name": "ABC Suppliers Pvt Ltd",
        "net_amount": 23990,
        "due_date": "2026-04-18T00:00:00.000Z",
        "status": "pending"
      }
    ]
  }
}
```

### Response Fields

| Field | Description |
|---|---|
| `total_bills` | Count of all non-draft bills |
| `total_grand` | Sum of `grand_total` (before tax) across all non-draft bills |
| `total_tax` | Sum of `total_tax` across all non-draft bills |
| `total_net` | Sum of `net_amount` — total payable across all non-draft bills |
| `by_status` | Per-status breakdown: count + net_amount |
| `recent` | Last 5 bills sorted by `doc_date` descending |

> `draft` bills are excluded from all financial totals but appear in `by_status` if they exist.

---

## 7. Create Purchase Bill

Creates a new purchase bill and automatically marks all linked GRN transactions as billed.

```
POST /purchasebill/create
Content-Type: application/json
```

**Auth required:** `finance > purchasebill > create`

### Request Body

```json
{
  "doc_id":         "PB/25-26/0001",
  "doc_date":       "2026-03-19",
  "invoice_no":     "RA/Q1/04200",
  "invoice_date":   "2026-03-15",
  "credit_days":    30,
  "narration":      "Purchase for: INFRA Project",

  "tender_id":      "TND-001",
  "tender_ref":     "67a1b2c3d4e5f6a7b8c9d0e1",
  "tender_name":    "INFRA Road Project Phase 1",

  "vendor_id":      "VND-002",

  "tax_mode":        "instate",

  "line_items": [
    {
      "grn_no":           "GRN-0042",
      "grn_ref":          "67a1b2c3d4e5f6a7b8c9d0e3",
      "ref_date":         "2026-03-10",
      "item_id":          "67a1b2c3d4e5f6a7b8c9d0e4",
      "item_description": "Cement OPC 53 Grade",
      "unit":             "Bags",
      "accepted_qty":     50,
      "unit_price":       400,
      "gross_amt":        20000,
      "cgst_pct":         9,
      "sgst_pct":         9,
      "igst_pct":         0
    }
  ],

  "additional_charges": [
    {
      "type":         "Transport",
      "amount":       500,
      "gst_pct":      18,
      "is_deduction": false
    },
    {
      "type":         "Discount",
      "amount":       200,
      "gst_pct":      0,
      "is_deduction": true
    }
  ],

  "status": "pending"
}
```

### Request Fields

#### Top-level

| Field | Type | Required | Description |
|---|---|---|---|
| `doc_id` | `string` | **Yes** | From `GET /next-id` — bill's unique system ID |
| `doc_date` | `date` | No | Bill date. Defaults to today |
| `invoice_no` | `string` | No | Vendor's invoice number |
| `invoice_date` | `date` | No | Vendor's invoice date |
| `credit_days` | `number` | No | Payment credit period in days |
| `narration` | `string` | No | Free-text note |
| `tender_id` | `string` | No | Business key of the linked tender |
| `tender_ref` | `ObjectId` | No | MongoDB `_id` of the tender document |
| `tender_name` | `string` | No | Snapshot of tender name (preserved for history) |
| `vendor_id` | `string` | **Yes** | Business key of the vendor — used to auto-fill all vendor fields |
| `vendor_ref` | — | — | **Auto-filled** from `vendor_id` (vendor `_id`) — do not send |
| `vendor_name` | — | — | **Auto-filled** from vendor master (`company_name`) — do not send |
| `vendor_gstin` | — | — | **Auto-filled** from vendor master (`gstin`) — do not send |
| `place_of_supply` | — | — | **Auto-filled** from vendor master — do not send |
| `credit_days` | `number` | No | Defaults to vendor master `credit_day` if not provided |
| `tax_mode` | `"instate" \| "otherstate"` | No | Tax mode |
| `status` | `"draft" \| "pending" \| "approved"` | No | Defaults to `"pending"` |

#### `line_items[]` — minimum 1 item required

| Field | Type | Description |
|---|---|---|
| `grn_no` | `string` | GRN bill number from MaterialTransaction |
| `grn_ref` | `ObjectId` | `_id` of the MaterialTransaction document |
| `ref_date` | `date` | GRN date |
| `item_id` | `ObjectId` | `_id` of the Material document |
| `item_description` | `string` | Material name / description |
| `unit` | `string` | Unit of measurement |
| `accepted_qty` | `number` | Quantity received and accepted (same as GRN qty) |
| `unit_price` | `number` | Rate per unit (quoted_rate from GRN) |
| `gross_amt` | `number` | `accepted_qty × unit_price` |
| `cgst_pct` | `number` | CGST rate % |
| `sgst_pct` | `number` | SGST rate % |
| `igst_pct` | `number` | IGST rate % |

> `cgst_amt`, `sgst_amt`, `igst_amt`, `net_amt` are **computed by the server** — do not send them.

#### `additional_charges[]`

| Field | Type | Description |
|---|---|---|
| `type` | `string` (enum) | One of the allowed charge types (see below) |
| `amount` | `number` | Base charge amount |
| `gst_pct` | `number` | GST % on the charge (0 if none) |
| `is_deduction` | `boolean` | `true` → subtracts from total |

**Allowed `type` values:**

| Type | Deduction |
|---|---|
| `Transport` | No |
| `Supplier` | No |
| `Loading / Unloading` | No |
| `Insurance` | No |
| `Freight` | No |
| `Packing Charges` | No |
| `Discount` | Yes |
| `TCS Receivable` | Yes |
| `Retention` | Yes |
| `Security Deposit` | Yes |

### Server-computed Fields (do not send)

The pre-save hook automatically calculates these from the data you send:

| Field | Derived from |
|---|---|
| `line_items[].cgst_amt` | `gross_amt × cgst_pct / 100` |
| `line_items[].sgst_amt` | `gross_amt × sgst_pct / 100` |
| `line_items[].igst_amt` | `gross_amt × igst_pct / 100` |
| `line_items[].net_amt` | `gross_amt + cgst_amt + sgst_amt + igst_amt` |
| `tax_groups` | Grouped from `line_items` by rate slab |
| `grand_total` | `Σ line_items.gross_amt` |
| `total_tax` | `Σ all GST amounts across tax_groups` |
| `additional_charges[].net` | `amount + (amount × gst_pct / 100)`, negative if `is_deduction` |
| `round_off` | `Math.round(preRound) − preRound` (±0.99) |
| `net_amount` | `Math.round(grand_total + total_tax + Σ charges.net)` |
| `due_date` | `doc_date + credit_days` |

### Side Effects

After saving the bill, all linked `MaterialTransaction` documents (matched by `grn_ref` or `grn_no`) are updated:
```
is_bill_generated: true
purchase_bill_id:  "<doc_id>"
```

### Success Response `201`

```json
{
  "status": true,
  "message": "Purchase bill created",
  "data": {
    "doc_id": "PB/25-26/0001",
    "doc_date": "2026-03-19T00:00:00.000Z",
    "invoice_no": "RA/Q1/04200",
    "invoice_date": "2026-03-15T00:00:00.000Z",
    "credit_days": 30,
    "due_date": "2026-04-18T00:00:00.000Z",
    "narration": "Purchase for: INFRA Project",
    "tender_id": "TND-001",
    "tender_name": "INFRA Road Project Phase 1",
    "vendor_id": "VND-002",
    "vendor_name": "ABC Suppliers Pvt Ltd",
    "vendor_gstin": "27AABCU9603R1ZX",
    "place_of_supply": "InState",
    "tax_mode": "instate",
    "line_items": [
      {
        "grn_no": "GRN-0042",
        "grn_ref": "67a1b2c3d4e5f6a7b8c9d0e3",
        "ref_date": "2026-03-10T00:00:00.000Z",
        "item_description": "Cement OPC 53 Grade",
        "unit": "Bags",
        "accepted_qty": 50,
        "unit_price": 400,
        "gross_amt": 20000,
        "cgst_pct": 9, "cgst_amt": 1800,
        "sgst_pct": 9, "sgst_amt": 1800,
        "igst_pct": 0, "igst_amt": 0,
        "net_amt": 23600
      }
    ],
    "tax_groups": [
      { "cgst_pct": 9, "sgst_pct": 9, "igst_pct": 0, "taxable": 20000, "cgst_amt": 1800, "sgst_amt": 1800, "igst_amt": 0 }
    ],
    "additional_charges": [
      { "type": "Transport", "amount": 500, "gst_pct": 18, "net": 590,  "is_deduction": false },
      { "type": "Discount",  "amount": 200, "gst_pct": 0,  "net": -200, "is_deduction": true  }
    ],
    "grand_total": 20000,
    "total_tax":   3600,
    "round_off":   0,
    "net_amount":  23990,
    "status": "pending",
    "createdAt": "2026-03-19T10:30:00.000Z",
    "updatedAt": "2026-03-19T10:30:00.000Z"
  }
}
```

### Error Responses

| Status | Condition | Message |
|---|---|---|
| `400` | `doc_id` missing | `"doc_id is required"` |
| `400` | `vendor_id` missing | `"vendor_id is required"` |
| `400` | `vendor_id` not found in vendor master | `"Vendor 'VND-XXX' not found"` |
| `400` | `invoice_no` already exists for this vendor | `"Invoice number '...' already exists for this vendor"` |
| `400` | `line_items` is empty | `"A purchase bill must have at least one line item"` |
| `500` | DB error / duplicate `doc_id` | `error.message` |

---

## 8. Approve Purchase Bill

Approves a purchase bill and **automatically posts a Credit entry** to the supplier ledger, creating the payable.

```
PATCH /purchasebill/approve/:id
```

**Auth required:** `finance > purchasebill > edit`
**URL Params:** `id` — MongoDB `_id` of the purchase bill

### Success Response `200`

```json
{
  "status": true,
  "message": "Purchase bill approved and posted to ledger",
  "data": {
    "doc_id": "PB/25-26/0001",
    "status": "approved",
    ...
  }
}
```

### Error Responses

| Status | Condition | Message |
|---|---|---|
| `400` | `id` not found | `"Purchase bill not found"` |
| `400` | Already approved | `"Already approved"` |
| `500` | DB / ledger error | `error.message` |

### Ledger Effect

When a bill is approved, a `LedgerEntry` is automatically created:

```
supplier_type : "Vendor"
vch_type      : "PurchaseBill"
credit_amt    : net_amount      ← Cr entry — liability created (you owe the vendor)
debit_amt     : 0
```

> The ledger entry is protected against double-posting — calling approve twice returns `400 Already approved`.

---

## 9. Get Purchase Bill by ID

```
GET /purchasebill/:id
```

**Auth required:** `finance > purchasebill > read`
**URL Params:** `id` — MongoDB `_id` of the purchase bill

Returns the full bill detail including `line_items`, `tax_groups`, and `additional_charges`.

> **Note:** This route must be placed last in the route file — after all named paths — to avoid `:id` matching route names like `list`, `next-id`, `summary-all`, etc.

### Success Response `200`

```json
{
  "status": true,
  "data": { ...full bill fields... }
}
```

### Error Responses

| Status | Condition | Message |
|---|---|---|
| `404` | `id` not found | `"Purchase bill not found"` |

---

## 10. Update Purchase Bill

```
PATCH /purchasebill/update/:id
Content-Type: application/json
```

**Auth required:** `finance > purchasebill > edit`

Only `draft` or `pending` bills can be updated. Approved or paid bills are blocked.

**Updatable fields:** `doc_date`, `invoice_no`, `invoice_date`, `credit_days`, `narration`, `tax_mode`, `line_items`, `additional_charges`, `status`

> **Note:** Triggers the pre-save hook — all computed fields (`cgst_amt`, `net_amount`, `due_date`, etc.) are recalculated automatically. Do not send server-computed fields.

### Success Response `200`

```json
{
  "status": true,
  "message": "Purchase bill updated",
  "data": { ...updated bill fields... }
}
```

### Error Responses

| Status | Condition | Message |
|---|---|---|
| `400` | Bill is approved or paid | `"Cannot edit an approved or paid bill"` |
| `404` | `id` not found | `"Purchase bill not found"` |

---

## 11. Delete Purchase Bill

```
DELETE /purchasebill/delete/:id
```

**Auth required:** `finance > purchasebill > delete`

Only `draft` bills can be deleted. Approved or paid bills are blocked.

### Success Response `200`

```json
{
  "status": true,
  "message": "Purchase bill deleted",
  "data": { ...deleted bill fields... }
}
```

### Error Responses

| Status | Condition | Message |
|---|---|---|
| `400` | Bill is approved or paid | `"Cannot delete an approved or paid bill"` |
| `404` | `id` not found | `"Purchase bill not found"` |

---

## Workflow

```
1. Open Tender billing tab
   GET  /purchasebill/summary/:tenderId      → render totals card and status breakdown

2. Open Bills list
   GET  /purchasebill/by-tender/:tenderId    → bill table

3. Open Create Bill form
   GET  /purchasebill/next-id               → get doc_id, pre-fill bill number

4. User fills in Tender + Vendor (vendor_id), picks GRN entries
   POST /purchasebill/create               → server auto-fills vendor fields from master
                                           → bill saved, GRNs marked as billed
                                           → status = "pending" by default

5. Finance approves
   PATCH /purchasebill/approve/:id         → status → "approved"
                                           → LedgerEntry posted (credit_amt = net_amount)
                                           → vendor payable register updated

6. Refresh list + summary
   GET  /purchasebill/by-tender/:tenderId
   GET  /purchasebill/summary/:tenderId
   GET  /ledger/balance/VND-XXX            → see updated vendor payable balance
```

> **Frontend note:** Do not send `vendor_ref`, `vendor_name`, `vendor_gstin`, or `place_of_supply` in the create payload — the server fetches and locks them automatically from the vendor master using `vendor_id`.
