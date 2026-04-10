# Payroll API

Base path: `/payroll`

All routes require JWT. HR actions require `hr.payroll.*` permission.

---

## How Payroll Generation Works

1. HR triggers `/payroll/generate` (single) or `/payroll/bulk-generate` (all active employees) at month-end.
2. The service reads the employee's `basicSalary` from their profile.
3. Attendance data for the month is fetched to count Present / Half-Day / Absent / LWP days.
4. Earnings and deductions are auto-calculated.
5. HR reviews, sets TDS via `/payroll/tax/:id`, then marks status as `Processed` → `Paid`.

---

## Calculation Formula

### Earnings

| Component | Formula |
|---|---|
| Basic | From employee profile |
| HRA | 40% of Basic |
| DA | 10% of Basic |
| Overtime Pay | (Basic / 30 / 8) × 1.5 × overtime hours |
| Gross Pay | Basic + HRA + DA + Overtime |

### Deductions

| Component | Formula |
|---|---|
| PF | 12% of Basic |
| ESI | 0.75% of Gross (only if Basic ≤ ₹21,000) |
| LWP Deduction | (Basic / 30) × LWP days |
| Half-Day Deduction | (Basic / 30) × 0.5 × half-day count |
| TDS | Set manually by HR |

**Net Pay = Gross Pay − Total Deductions**

---

## Endpoints

### POST `/payroll/generate`
Generate payroll for a single employee. Permission: `hr.payroll.create`

```json
{ "employeeId": "<id>", "month": 4, "year": 2026 }
```

**Response `201`:**
```json
{
  "status": true,
  "data": {
    "_id": "...",
    "month": 4, "year": 2026,
    "earnings": { "basic": 30000, "hra": 12000, "da": 3000, "grossPay": 45000 },
    "deductions": { "pf": 3600, "esi": 0, "lwpDeduction": 0, "totalDeductions": 3600 },
    "netPay": 41400,
    "status": "Pending"
  }
}
```

---

### POST `/payroll/bulk-generate`
Generate payroll for **all active employees** with a basic salary set. Permission: `hr.payroll.create`

```json
{ "month": 4, "year": 2026 }
```

**Response:**
```json
{
  "data": {
    "generated": ["<id1>", "<id2>"],
    "skipped": ["<id3>"],
    "errors": [{ "employeeId": "<id4>", "message": "Employee basic salary not set" }]
  }
}
```

---

### GET `/payroll/my-payslips`
Employee views their own payslips. Requires JWT.

**Query:** `?year=2026`

---

### GET `/payroll/employee/:employeeId`
HR views any employee's payslip history. Permission: `hr.payroll.read`

**Query:** `?year=2026`

---

### GET `/payroll/monthly-run`
Full payroll run for a month (all employees). Permission: `hr.payroll.read`

**Query:** `?month=4&year=2026`

---

### PUT `/payroll/status/:id`
Update payroll processing status. Permission: `hr.payroll.edit`

```json
{
  "status": "Paid",
  "transactionId": "NEFT20260430001",
  "paymentDate": "2026-04-30"
}
```

`status` enum: `Pending` → `Processed` → `Paid`

---

### PUT `/payroll/tax/:id`
Set TDS (Tax Deducted at Source) amount manually. Permission: `hr.payroll.edit`

```json
{ "taxAmount": 2500 }
```

Net Pay is recalculated automatically.

---

### GET `/payroll/export-excel`
Download payroll as `.xlsx` for the given month. Permission: `hr.payroll.read`

**Query:** `?month=4&year=2026`

**Response:** Binary `.xlsx` file download (`Content-Disposition: attachment`)

Contains two sheets:
- **Bank Transfer** — Employee, Bank Name, Account No., IFSC, Net Pay (ready for NEFT upload)
- **Payroll Detail** — Full breakdown: earnings, deductions, attendance summary per employee

---

## Payroll Status Flow

```
Pending   → (HR reviews) → Processed → (Bank transfer) → Paid
```

---

## Employee Payroll Setup

Before generating payroll, set the employee's salary details via `PUT /employee/update/:employeeId`:

```json
{
  "payroll": {
    "basicSalary": 30000,
    "accountHolderName": "John Doe",
    "bankName": "HDFC Bank",
    "accountNumber": "1234567890",
    "ifscCode": "HDFC0001234",
    "uanNumber": "100123456789",
    "panNumber": "ABCDE1234F"
  }
}
```
