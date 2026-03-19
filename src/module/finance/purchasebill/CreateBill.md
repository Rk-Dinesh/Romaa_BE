# CreateBill — Purchase Bill Entry

**File:** `src/pages/purchase/purchase bill/CreateBill.jsx`
**Module:** Purchase → Purchase Bill
**Type:** Full-page form (fixed overlay, `z-50`)

---

## Overview

`CreateBill` is a full-viewport purchase bill creation form. It follows a guided workflow:

1. Fill **Bill Identity** (bill ref, dates, tender, vendor)
2. Fill **Bill Configuration** (credit days, tax mode)
3. Press **Enter** or click **Select GRN Entries** to open the GRN picker
4. Confirm GRN entries → tables auto-populate
5. Add optional **Additional Charges / Deductions**
6. Review **Invoice Summary** and submit

Once GRN is picked, the Tender, Vendor, and Credit Days fields are **locked** (read-only). A **↺ Reset** button in the header clears everything to start over.

---

## Props

| Prop | Type | Description |
|------|------|-------------|
| `onclose` | `() => void` | Called when the user clicks Cancel or the ✕ button |
| `onSuccess` | `() => void` | Called after a successful bill save (via mutation) |

---

## State

| State | Type | Description |
|-------|------|-------------|
| `grnRows` | `GrnRow[]` | Linked GRN entries (populated from picker) |
| `itemRows` | `ItemRow[]` | Line items (populated from picker) |
| `selectedTenderId` | `string` | Currently selected tender ID |
| `selectedVendorId` | `string` | Currently selected vendor ID |
| `selectedPlaceOfSupply` | `string` | `"InState"` or `"Others"` — drives tax mode |
| `additionalCharges` | `Charge[]` | User-added charges/deductions in the tax table |
| `showGrnPicker` | `boolean` | Controls the GRN picker modal |

### Derived booleans

| Derived | Logic | Effect |
|---------|-------|--------|
| `isInState` | `selectedPlaceOfSupply === "InState"` | `true` → CGST + SGST; `false` → IGST |
| `grnLocked` | `grnRows[0].grn_no !== ""` | Locks Tender, Vendor, Credit Days fields after GRN pick |

---

## Form Fields (react-hook-form + yup)

| Field | Required | Validation |
|-------|----------|------------|
| `bill_no` | Yes | Non-empty string |
| `bill_date` | Yes | Non-empty string (date) |
| `invoice_no` | Yes | Non-empty string |
| `invoice_date` | Yes | Non-empty string (date) |
| `credit_days` | No | Number ≥ 0, nullable |
| `narration` | No | String, nullable |

---

## Data Hooks (`./hooks/usePurchaseBill.js`)

| Hook | API Endpoint | Purpose |
|------|-------------|---------|
| `useTenderIds()` | `GET /tender/gettendersid` | Populates tender dropdown |
| `usePermittedVendors(tenderId)` | `GET /permittedvendor/getvendor/:tenderId` | Populates vendor dropdown (includes `place_of_supply`, `credit_day`) |
| `useGRNForBilling(tenderId, vendorId)` | `GET /material/grn/billing/:tenderId/:vendorId` | GRN entries for the picker modal |
| `useCreateBill({ onSuccess, onClose })` | `POST /purchase/bill/create` | Submits the bill |

---

## Workflow Details

### Opening the GRN Picker

`openGrnPicker()` validates all required fields in order and shows a `toast.info` for the first missing one:

1. Tender selected
2. Vendor selected
3. Bill No entered
4. Bill Date entered
5. Invoice No entered
6. Invoice Date entered

Triggers via:
- **Enter key** on any input inside the Bill Identity / Bill Configuration wrapper
- **"Select GRN Entries"** button in Bill Configuration

> Note: Enter key is suppressed on `BUTTON`, `TEXTAREA`, and `SELECT` elements to avoid conflicts.

### GRN Picker (`GRNPickerModal`)

- Multi-select table of GRN entries for the chosen tender + vendor
- Filter by Purchase Request Ref
- Select all / individual rows via checkboxes
- Click row to toggle selection
- Press **Enter** (when entries selected) or click **Link GRNs** to confirm

On confirm (`handleGrnPickerConfirm`):
- Populates `grnRows` from `grn_bill_no`, `party_bill_no`, `date`, `quantity`
- Populates `itemRows` from `item_description`, `unit`, `quantity`, `quoted_rate`
- Tax rates read from GRN entry with fallback chain:
  ```
  e.tax_structure?.cgst ?? e.taxStructure?.cgst ?? e.cgst_pct ?? e.cgst ?? 0
  ```
- Locks Tender, Vendor, Credit Days fields (`grnLocked = true`)

---

## Tax Calculation

### GST Mode

| `place_of_supply` | Tax Applied |
|-------------------|------------|
| `"InState"` | CGST + SGST (per item rates) |
| `"Others"` | IGST (per item rates) |

### Tax Grouping

Line items are grouped by rate combination (e.g. all items at CGST 9% + SGST 9% form one group). The tax table always shows **one combined row** per tax type:

- **InState:** `CGST @ 9% + 5%` (sum of all CGST across groups), `SGST @ 9% + 5%`
- **Inter-state:** `IGST @ 18% + 12%`

### Total Calculation

```
grandTotal      = sum of itemRows gross_amt
totalTax        = sum of (CGST + SGST) or IGST across all rate groups
additionalTotal = sum of chargeDetails.net  (deductions are negative)
preRound        = grandTotal + totalTax + additionalTotal
roundOff        = Math.round(preRound) − preRound   (always within ±0.99)
netAmount       = Math.round(preRound)
```

---

## Additional Charges

User can add one row per charge type from the dropdown at the bottom of the tax table. Each row has an **Amount** and optional **GST %** (inline in the Amount cell).

| Charge Type | Deduction? |
|-------------|-----------|
| Transport | No |
| Supplier | No |
| Loading / Unloading | No |
| Insurance | No |
| Freight | No |
| Packing Charges | No |
| Discount | Yes |
| TCS Receivable | Yes |

- Once a charge type is added it disappears from the dropdown (no duplicates).
- Deduction rows show a red "Deduction" badge and subtract from the total.

---

## Locking & Reset

After GRN is confirmed:
- **Project / Tender**, **Vendor / Supplier**, and **Credit Days** render as `LockedField` (teal read-only pill with "Locked" badge).
- A **↺ Reset** button appears in the top-right header bar.

`handleFullReset()` clears:
- `grnRows`, `itemRows` → back to empty factory defaults
- `selectedTenderId`, `selectedVendorId`, `selectedPlaceOfSupply` → `""`
- `additionalCharges` → `[]`
- All form fields via `reset()`

---

## Payload Sent to API

```json
{
  "bill_no": "RF/C2/25-26/PB/01019",
  "bill_date": "2026-03-19",
  "invoice_no": "RA/Q1/04200",
  "invoice_date": "2026-03-15",
  "credit_days": 30,
  "narration": "Purchase for: INFRA",
  "tender_id": "T001",
  "vendor_id": "V002",
  "place_of_supply": "InState",
  "tax_mode": "instate",
  "due_date": "2026-04-18",
  "grn_rows": [{ "grn_no": "", "grn_ref_no": "", "ref_date": "", "grn_qty": "" }],
  "line_items": [{ "item_id": "", "unit": "", "accepted_qty": "", "unit_price": "", "gross_amt": "", "net_amt": "", "cgst_pct": 9, "sgst_pct": 9, "igst_pct": 0 }],
  "tax_groups": [{ "cgst_pct": 9, "sgst_pct": 9, "taxable": 1000, "cgstAmt": 90, "sgstAmt": 90 }],
  "total_tax": 180,
  "additional_charges": [{ "type": "Transport", "amount": 500, "gst_pct": 18, "net": 590 }],
  "round_off": 0.37,
  "grand_total": 1000,
  "net_amount": 1771
}
```

---

## Sub-components (file-local)

| Component | Props | Purpose |
|-----------|-------|---------|
| `SectionCard` | `iconEl, title, accent, noPad, overflow, className` | Styled card wrapper with coloured header bar |
| `SearchableSelect` | `options, value, onChange, placeholder, disabled, isLoading` | Searchable dropdown with outside-click close (`z-[200]`) |
| `GRNPickerModal` | `data, isLoading, onClose, onConfirm` | Multi-select GRN entry picker overlay (`z-[60]`) |
| `LockedField` | `value` | Read-only teal pill shown when `grnLocked` |
| `SummaryRow` | `label, value, deduction` | Row in the Invoice Summary panel |
| `Field` | `label, required, error, children` | Form field wrapper with label and error message |

---

## Utility Functions (file-level)

| Function | Description |
|----------|-------------|
| `toWords(n)` | Converts integer to Indian number words (Lakh, Thousand, Hundred…) |
| `toWordsRupees(n)` | Wraps `toWords` → `"Rupees X Only"` |
| `fmt(n)` | `n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })` |
| `emptyGrnRow()` | Returns a blank GRN row object |
| `emptyItemRow()` | Returns a blank line item row object (includes `cgst_pct`, `sgst_pct`, `igst_pct`) |
