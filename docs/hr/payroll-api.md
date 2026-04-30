# Payroll

Base path: `/payroll` — generates monthly payroll documents for employees, exposes structured payslip JSON for the frontend to render to PDF, supports bulk-generate, status transitions (Pending → Processed → Paid), TDS update, and NEFT-format Excel export.

See [README.md](README.md) for shared conventions.

---

## 1. Data model

```jsonc
// One document per (employeeId, month, year)
{
  employeeId,
  month, year,                 // 1..12, e.g. 2026

  attendanceSummary: {
    totalWorkingDays,          // count of attendance records the cron created in the month
    presentDays,               // includes 0.5 per Half-Day
    paidLeaves,                // status === "On Leave"
    lwp,                       // status === "Absent"
    overtimeHours
  },
  earnings: {
    basic, hra, da, overtimePay, otherAllowances, grossPay
  },
  deductions: {
    pf, esi, tax, lwpDeduction, totalDeductions
  },
  netPay,

  status: "Pending" | "Processed" | "Paid",
  paymentDate, transactionId,    // bank NEFT/RTGS reference
  payslipUrl                     // S3 URL when frontend persists a generated PDF (currently unused server-side)
}
```

Compound unique index on `(employeeId, month, year)` — generation is idempotent: a second `generate` for the same employee/month returns 409.

The math (post-fix):
- `perDayBasic = basicSalary / daysInMonth` (B6 fix — was hardcoded `/30`)
- `hra = 0.40 × basicSalary`, `da = 0.10 × basicSalary` (defaults — make configurable in future)
- `overtimePay = (perDayBasic / 8) × 1.5 × overtimeHours`
- `pf = 0.12 × basicSalary`
- `esi = grossPay <= 21000 ? 0.0075 × grossPay : 0` (B5 fix — was incorrectly `basicSalary <= 21000`)
- `lwpDeduction = perDayBasic × lwpDays` + `perDayBasic × halfDays` (B2 fix — `lwpDays` now correctly counts every Absent status)

---

## 2. Endpoint catalog

### Employee

| Method | Path | Use |
|---|---|---|
| GET | `/payroll/my-payslips?year=` | own payroll docs for a year |
| GET | `/payroll/payslip/:id` | structured payslip JSON; gated by ownership OR `hr.payroll.read` |

### HR (`hr.payroll.*`)

| Method | Path | Permission |
|---|---|---|
| POST | `/payroll/generate` | `create` |
| POST | `/payroll/bulk-generate` | `create` |
| GET | `/payroll/monthly-run?month=&year=&page=&limit=&search=` | `read` |
| GET | `/payroll/employee/:employeeId?year=` | `read` |
| PUT | `/payroll/status/:id` | `edit` |
| PUT | `/payroll/tax/:id` | `edit` |
| GET | `/payroll/export-excel?month=&year=` | `read` |

---

## 3. Detailed specs

### POST `/payroll/generate`

```jsonc
{
  "employeeId": "<Employee _id>",
  "month": 4,
  "year": 2026
}

// 201 — { status:true, message:"Payroll generated successfully", data:<Payroll> }
// 400 — basic salary not set on the employee
// 409 — already generated for that month
```

Aggregates the month's attendance + leave data and persists with `status: "Pending"`.

UI: HR Payroll month-end → "Generate" button per employee row. After 201, the row flips from "Not generated" to "Pending".

### POST `/payroll/bulk-generate`

```jsonc
{ "month": 4, "year": 2026 }

// 200
{ "status":true, "message":"Bulk payroll generation complete",
  "data": { "generated": [<id>, ...], "skipped": [<empId>, ...], "errors": [{employeeId, message}] } }
```

Iterates active employees with a positive `basicSalary`. Already-generated rows are reported in `skipped`. Errors (missing basic salary, etc.) end up in `errors`.

UI: HR Payroll page → "Run for current month" CTA. Show a result modal:

```
✓ Generated: 65 employees
⚠ Skipped (already generated): 3
✗ Errors: 1
   EMP-019 — Employee basic salary not set
```

### GET `/payroll/monthly-run?month=4&year=2026`

Paginated list of all payroll docs for that month.

```jsonc
{ "data": [
    { "_id", "employeeId":{populated:{name, employeeId, designation, department, payroll}},
      "month", "year", "earnings", "deductions", "netPay", "status", "paymentDate", "transactionId" },
    ...
  ], "currentPage", "totalPages", "totalCount" }
```

UI: HR Payroll month-end main table.

### GET `/payroll/employee/:employeeId?year=`

Per-employee historical payroll list (paginated, sorted year-desc/month-desc).

UI: Employee detail → "Payroll" tab. List of months with status pill + amount.

### PUT `/payroll/status/:id`

```jsonc
{
  "status": "Pending" | "Processed" | "Paid",
  "transactionId": "NEFT-2026-0001",   // optional
  "paymentDate": "2026-05-05"          // optional
}
```

UI: HR — bulk-action toolbar after running NEFT export → "Mark Processed" → after bank confirms → "Mark Paid".

### PUT `/payroll/tax/:id`

```jsonc
{ "taxAmount": 4500 }

// 400 — payroll already in "Paid" status
```

Re-computes `totalDeductions` and `netPay` after the manual TDS entry. Workflow:

1. HR runs `bulk-generate` (TDS = 0)
2. Tax team computes TDS per employee (slab-based — manual today; auto in future)
3. HR enters TDS via `PUT /payroll/tax/:id`
4. HR moves status to `Processed`, exports NEFT, marks `Paid` after bank.

### GET `/payroll/payslip/:id`

Structured JSON the frontend renders to PDF. **Not** a file download.

```jsonc
{
  "status": true,
  "data": {
    "payslipId",
    "period": { "month": 4, "year": 2026, "label": "April 2026" },
    "employee": {
      "empId":"EMP-042", "name", "email", "phone",
      "designation", "department", "dateOfJoining", "address",
      "bank": { "name", "accountHolder", "accountNumber", "ifsc", "uan", "pan" }
    },
    "attendance": { totalWorkingDays, presentDays, paidLeaves, lwp, overtimeHours },
    "earnings": { basic, hra, da, overtimePay, otherAllowances, grossPay, total },
    "deductions": { pf, esi, tax, lwpDeduction, totalDeductions },
    "netPay": 36500,
    "netPayInWords": "Thirty Six Thousand Five Hundred Rupees Only",
    "status": "Pending" | "Processed" | "Paid",
    "paymentDate", "transactionId",
    "generatedAt"
  }
}
```

Permission: caller must own the record (`payroll.employeeId === req.user._id`) **or** have `hr.payroll.read`. Otherwise 403. This was tightened in G1 — the endpoint exposes PII (account number, IFSC, PAN, UAN) and must be gated.

UI: feeds the payslip viewer / PDF generator. Rendering library examples:
- React: `@react-pdf/renderer` or `jsPDF` + `html2canvas`
- Mobile: `react-native-html-to-pdf` from a styled HTML template

A reasonable rendered layout:

```
┌────────────────────────────────────────────────────────┐
│  ROMAA CONSTRUCTION LTD.                                │
│  Pay slip for the month of April 2026                   │
├────────────────────────────────────────────────────────┤
│  Name:         Priya Krishnan          Emp ID: EMP-042  │
│  Designation:  Site Engineer            Dept: Engg.     │
│  PAN:          ABCDE1234F               UAN:  100200... │
│  Bank A/C:     1234567890123 / SBIN0001234              │
├────────────────────────────────────────────────────────┤
│  Attendance summary                                     │
│  Working days 30   Present 26   Leaves 2   LWP 1   OT 4 │
├────────────────────────────────────────────────────────┤
│  Earnings              ₹       │  Deductions     ₹      │
│  Basic              30,000     │  PF          3,600     │
│  HRA                12,000     │  ESI            —      │
│  DA                  3,000     │  TDS         4,500     │
│  Overtime              900     │  LWP / Half     950     │
│  Other allowance       —       │                        │
│  ───────────────────────       │  ───────────────       │
│  Gross pay          45,900     │  Total       9,050     │
│                                │                        │
│  Net Pay   ₹ 36,850                                     │
│  In words: Thirty Six Thousand Eight Hundred Fifty Rupees Only │
│                                                         │
│  Generated 30 Apr 2026                                  │
└────────────────────────────────────────────────────────┘
```

### GET `/payroll/export-excel?month=&year=`

Returns an ExcelJS workbook with two sheets:
- **Sheet 1 — Bank Transfer**: NEFT-friendly columns (Sr No, Emp ID, Name, Bank, A/C, IFSC, Net Pay, Status). Includes a Total row.
- **Sheet 2 — Payroll Detail**: full per-employee breakdown of every earning/deduction.

```
Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
Content-Disposition: attachment; filename="Payroll_2026_04.xlsx"
```

UI: HR Payroll page → "Export NEFT" button. Browser triggers download directly.

---

## 4. UI design ideas

### HR Payroll month-end console

```
┌─ Payroll · April 2026 ─────────────────────────────────────────────────┐
│  [Run for April]   [Export NEFT]   [Mark all Processed]   [Mark Paid]  │
├─────────────────────────────────────────────────────────────────────────┤
│  Filter: [Status v]  [Department v]  [Search ...]                      │
├─────────────────────────────────────────────────────────────────────────┤
│  EMP-001  Priya K          Engineering    ₹36,850   Pending    [···]   │
│  EMP-002  Suresh K         Engineering    ₹52,400   Processed  [···]   │
│  EMP-003  Anand R          Site Ops       ₹41,200   Paid       [···]   │
│  ...                                                                    │
├─────────────────────────────────────────────────────────────────────────┤
│  Total payable: ₹4,82,300                                               │
└─────────────────────────────────────────────────────────────────────────┘
```

Row action menu:
- View payslip (opens the PDF viewer)
- Update TDS
- Update status
- View employee details

### Employee — My Payslips

```
┌─ My Payslips · 2026 ─────────────────────────┐
│  April 2026     ₹36,850     Paid     [📄]    │
│  March 2026     ₹35,200     Paid     [📄]    │
│  February 2026  ₹37,100     Paid     [📄]    │
│  January 2026   ₹34,800     Paid     [📄]    │
└──────────────────────────────────────────────┘
```

Tap the page icon → render the payslip from `/payroll/payslip/:id` to PDF and either preview or share.

### TDS update modal

Simple numeric input + summary recalculation preview ("Net Pay drops from ₹41,350 to ₹36,850"). Disable the Save button when payroll is `Paid`.

### Bulk-generate result modal

Show the three buckets (generated / skipped / errors) with a fix-and-retry CTA per error row that deep-links to the employee's profile.

---

## 5. What's NOT here yet

The following are flagged for a future payroll modernisation pass (see memory `hr_module_2026_04_30.md`):

- **Server-side payslip PDF** — currently the frontend renders. A `?format=pdf` flag on `/payroll/payslip/:id` is reasonable when added.
- **Slab-based TDS auto-calc** — today HR enters TDS manually.
- **CTC structure** — only `basicSalary` is stored; HRA / DA are computed as fixed percentages.
- **Form 16, 24Q, ECR, PT challan** — none of these reports exist.
- **Loans & advances** — not modelled.
- **Reimbursements** — not modelled.
- **Leave encashment vouchers** — emitted by the year-end cron into the `LeaveEncashment` collection (see [leave-policy.md](leave-policy.md) §Year-end), but no UI consumes them yet.

---

## 6. Integration notes / gotchas

- **Compound unique index** — generating the same employee/month twice returns 409. Surface this as "Already generated; click View / Update TDS instead."
- **Status transitions** are unguarded — `Pending → Paid` skipping `Processed` is technically allowed by the API. Frontend should enforce the order via UX.
- **`payroll.employeeId.payroll`** — yes, the populated employee object carries a `payroll` sub-doc with bank details. Read those for NEFT files; don't re-query.
- **Net pay floor** — server clamps `Math.max(0, grossPay - totalDeductions)` so net pay never goes negative.
- **`totalWorkingDays` is the count of attendance documents in the month** — the daily absenteeism cron creates one per active employee per day (Present/Absent/On Leave/Holiday). If the cron didn't run for some days, `totalWorkingDays` will be lower than the calendar month length.
- **NEFT export uses the *current* employee bank fields** at export time — if HR changes bank details mid-month and re-exports, the second file reflects the new bank. There's no historical bank snapshot in the payroll doc itself.

---

## 7. Cross-references

- Attendance source data → [attendance-api.md](attendance-api.md)
- Encashment vouchers (year-end overflow) → [leave-policy.md](leave-policy.md) §Year-end
- Bank field updates → [employee-api.md](employee-api.md) §`/me/profile`
