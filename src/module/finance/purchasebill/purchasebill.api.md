# Purchase Bill — API Reference

**Base URL:** `/purchasebill`
**Module:** `finance → purchasebill`
**Auth:** JWT cookie or `Authorization: Bearer <token>` (currently commented out during development)

---

## 1. Get Next Bill ID

Returns the `doc_id` that will be assigned to the next bill. Call this before opening the Create Bill form to pre-fill the bill number.

```
GET /purchasebill/next-id
```

**Auth required:** No (dev) / `finance > purchasebill > read` (prod)
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

## 2. Create Purchase Bill

Creates a new purchase bill and automatically marks all linked GRN transactions as billed.

```
POST /purchasebill/create
Content-Type: application/json
```

**Auth required:** No (dev) / `finance > purchasebill > create` (prod)

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
  "vendor_ref":     "67a1b2c3d4e5f6a7b8c9d0e2",
  "vendor_name":    "ABC Suppliers Pvt Ltd",
  "vendor_gstin":   "27AABCU9603R1ZX",

  "place_of_supply": "InState",
  "tax_mode":        "instate",

  "grn_rows": [
    {
      "grn_no":   "GRN-0042",
      "grn_ref":  "67a1b2c3d4e5f6a7b8c9d0e3",
      "ref_date": "2026-03-10",
      "grn_qty":  50
    }
  ],

  "line_items": [
    {
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
| `vendor_id` | `string` | No | Business key of the vendor |
| `vendor_ref` | `ObjectId` | No | MongoDB `_id` of the vendor document |
| `vendor_name` | `string` | No | Snapshot of vendor name (preserved for history) |
| `vendor_gstin` | `string` | No | Snapshot of vendor GSTIN (for printing) |
| `place_of_supply` | `"InState" \| "Others"` | No | Drives CGST+SGST vs IGST |
| `tax_mode` | `"instate" \| "otherstate"` | No | Tax mode |
| `status` | `"draft" \| "pending" \| "approved" \| "paid"` | No | Defaults to `"pending"` |

#### `grn_rows[]`

| Field | Type | Description |
|---|---|---|
| `grn_no` | `string` | GRN bill number from MaterialTransaction |
| `grn_ref` | `ObjectId` | `_id` of the MaterialTransaction document |
| `ref_date` | `date` | GRN date |
| `grn_qty` | `number` | Quantity received in this GRN |

#### `line_items[]` — minimum 1 item required

| Field | Type | Description |
|---|---|---|
| `item_id` | `ObjectId` | `_id` of the Material document |
| `item_description` | `string` | Material name / description |
| `unit` | `string` | Unit of measurement |
| `accepted_qty` | `number` | Quantity accepted from GRN |
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
| `is_deduction` | `boolean` | `true` → subtracts from total (Discount, TCS Receivable) |

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
    "grn_rows": [
      { "grn_no": "GRN-0042", "ref_date": "2026-03-10T00:00:00.000Z", "grn_qty": 50 }
    ],
    "line_items": [
      {
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
| `400` | `doc_id` missing from body | `"doc_id is required"` |
| `400` | `line_items` is empty | `"A purchase bill must have at least one line item"` |
| `500` | DB error / duplicate `doc_id` | `error.message` |

---

## Workflow

```
1. User selects Tender + Vendor in the form
2. GET  /purchasebill/next-id          → get doc_id, show in form
3. User picks GRN entries (separate GRN picker API)
4. User reviews totals (pre-computed on frontend, verified by server)
5. POST /purchasebill/create           → bill saved, GRNs marked as billed
```
