# GRN APIs — Material Inward (Goods Receipt Note)

**Route prefix:** `/material`
**Collection:** `MaterialTransaction` (type: `"IN"`)

---

## 1. GET All Projects with GRN Summary

**`GET /material/grn/projects`**

Returns all tenders that have at least one GRN (inward) entry, aggregated with count, last date, and vendor list.

### Response `200`
```json
{
  "success": true,
  "count": 2,
  "data": [
    {
      "tender_id": "TND023",
      "project_name": "Romaa Sample Testing",
      "tender_name": "Romaa Review V1.2",
      "total_grn_entries": 5,
      "last_grn_date": "2026-03-17T00:00:00.000Z",
      "vendors": ["R Dinesh Kumar", "Tata"]
    },
    {
      "tender_id": "TND011",
      "project_name": "Highway Phase 1",
      "tender_name": "NH-44 Tender",
      "total_grn_entries": 12,
      "last_grn_date": "2026-03-10T00:00:00.000Z",
      "vendors": ["Ultratech Supplies"]
    }
  ]
}
```

### Notes
- Aggregates `MaterialTransaction` collection where `type = "IN"`, groups by `tender_id`
- `project_name` and `tender_name` are looked up from the `tenders` collection via `tender_id`
- Sorted by `last_grn_date` descending (most recent activity first)
- No query parameters

---

## 2. GET GRN Entries by Tender

**`GET /material/grn/entries/:tender_id`**

Returns all GRN (IN) transactions for a specific tender. Supports multiple optional filters via query parameters.

### URL Params
| Param | Required | Description |
|-------|----------|-------------|
| `tender_id` | Yes | The tender to fetch GRN entries for |

### Query Filters
| Param | Match | Description |
|-------|-------|-------------|
| `from` | Date range | Start date — ISO string e.g. `2026-03-01` |
| `to` | Date range | End date — ISO string e.g. `2026-03-31` (inclusive, end of day) |
| `vendor_id` | Exact | Filter by vendor ID e.g. `VEN001` |
| `vendor_name` | Partial, case-insensitive | Filter by vendor name e.g. `dinesh` |
| `grn_bill_no` | Partial, case-insensitive | Filter by GRN bill number e.g. `TND023/26-27` |
| `party_bill_no` | Partial, case-insensitive | Filter by party bill number e.g. `VEN001/TND023` |
| `item_description` | Partial, case-insensitive | Filter by material name e.g. `cement` |
| `purchase_request_ref` | Exact | Filter by PO reference e.g. `POR036` |
| `invoice_challan_no` | Partial, case-insensitive | Filter by invoice/challan number |

### Example Request
```
GET /material/grn/entries/TND023?from=2026-03-01&to=2026-03-31&vendor_id=VEN001
```

### Response `200`
```json
{
  "success": true,
  "total": 2,
  "data": [
    {
      "_id": "...",
      "tender_id": "TND023",
      "item_id": "...",
      "item_description": "40mm",
      "type": "IN",
      "quantity": 3,
      "date": "2026-03-17T00:00:00.000Z",
      "purchase_request_ref": "POR036",
      "site_name": "Site B",
      "vendor_name": "R Dinesh Kumar",
      "vendor_id": "VEN001",
      "quoted_rate": 1,
      "grn_bill_no": "TND023/26-27/0001",
      "party_bill_no": "VEN001/TND023/001",
      "invoice_challan_no": "INV0056",
      "received_by": "Admin",
      "remarks": "Received against POR036",
      "createdAt": "2026-03-17T07:53:34.954Z",
      "updatedAt": "2026-03-17T07:53:34.954Z"
    }
  ]
}
```

### Response `500` (tender_id missing or DB error)
```json
{ "success": false, "message": "tender_id is required" }
```

---

## GRN Bill Number Format

| Field | Format | Example | Sequence Basis |
|-------|--------|---------|----------------|
| `grn_bill_no` | `{tender_id}/{FY}/{seq4}` | `TND023/26-27/0001` | Last GRN seq for this tender in the current financial year |
| `party_bill_no` | `{vendor_id}/{tender_id}/{seq3}` | `VEN001/TND023/001` | Last party bill seq for this vendor + tender |

- **Financial year** — April to March. If current month ≥ April → `26-27`; if < April → `25-26`
- **Sequence** — derived from the last existing bill number (not a count), so gaps from deletions do not affect numbering
- Both numbers are **shared across all items** in a single `addMaterialReceived` call
- Sequences are stored on every transaction document in the batch
