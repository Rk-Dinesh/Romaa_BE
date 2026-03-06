# Dashboard API - Frontend Integration Guide

Base URL: `/dashboard`
Auth: Requires JWT token (cookie or `Authorization: Bearer <token>` header)

---

## Endpoint

```
GET /dashboard
```

Single endpoint. No query params needed. Returns **only the sections** the logged-in user has permission to see.

---

## How It Works

1. User logs in with JWT
2. Backend reads `user.role.permissions`
3. Only permitted sections are queried (in parallel for speed)
4. Site users (`userType: "Site"`) see data scoped to their `assignedProject` only
5. Response contains only the keys the user is authorized for
6. `myWorkProfile` and `notifications` are always present for any logged-in user

---

## Response Structure

```json
{
  "status": true,
  "data": {
    "overview": { ... },
    "tenderPipeline": { ... },
    "emdSummary": { ... },
    "penaltySummary": { ... },
    "purchaseRequests": { ... },
    "workOrders": { ... },
    "billing": { ... },
    "employees": { ... },
    "todayAttendance": { ... },
    "pendingLeaves": { ... },
    "machinery": { ... },
    "myWorkProfile": { ... },
    "upcomingDeadlines": { ... },
    "notifications": { ... }
  }
}
```

**Key point**: Not all sections will be present. Check if a key exists before rendering its card/widget.

```js
// Frontend example
if (data.tenderPipeline) {
  renderTenderCard(data.tenderPipeline);
}
```

---

## Section Details

### 1. `overview`

**Permission**: `dashboard.read`
**Purpose**: Top-level stat cards

```json
{
  "tenders": 45,
  "projects": 12,
  "activeEmployees": 230,
  "vendors": 67,
  "clients": 18
}
```

**Suggested UI**: 5 stat cards at the top of the dashboard

| Field | Label | Icon |
|-------|-------|------|
| `tenders` | Total Tenders | FileText |
| `projects` | Active Projects | Briefcase |
| `activeEmployees` | Active Employees | Users |
| `vendors` | Vendors | Truck |
| `clients` | Clients | Building |

---

### 2. `tenderPipeline`

**Permission**: `tender.tenders.read`
**Purpose**: Tender status breakdown + recent tenders list

```json
{
  "counts": {
    "total": 45,
    "pending": 30,
    "approved": 15,
    "withWorkOrder": 12,
    "totalValue": 125000000,
    "totalAgreementValue": 98000000
  },
  "recentTenders": [
    {
      "tender_id": "TND-045",
      "tender_name": "Highway NH-48 Extension",
      "tender_status": "PENDING",
      "tender_value": 5000000,
      "client_name": "NHAI",
      "createdAt": "2026-03-05T10:30:00.000Z"
    }
  ]
}
```

**Suggested UI**:
- Donut/pie chart: Pending vs Approved vs With Work Order
- Value cards: Total Value, Agreement Value
- Table: 5 recent tenders (linked to tender detail page)

---

### 3. `emdSummary`

**Permission**: `tender.emd.read`
**Purpose**: EMD and Security Deposit financial overview

```json
{
  "totalApprovedAmount": 5000000,
  "totalCollected": 3500000,
  "totalPending": 1500000,
  "sdTotalAmount": 8000000,
  "sdCollected": 2000000,
  "sdPending": 6000000,
  "count": 12
}
```

**Suggested UI**: Two side-by-side progress bars or gauges

| Group | Label | Value | Max |
|-------|-------|-------|-----|
| EMD | Collected | `totalCollected` | `totalApprovedAmount` |
| EMD | Pending | `totalPending` | - |
| SD | Collected | `sdCollected` | `sdTotalAmount` |
| SD | Pending | `sdPending` | - |

---

### 4. `penaltySummary`

**Permission**: `tender.project_penalty.read`
**Purpose**: Penalty overview — total + project-based breakdown

```json
{
  "totalPenaltyValue": 750000,
  "tendersWithPenalties": 5,
  "byProject": [
    {
      "_id": "TND-012",
      "projectName": "NH-48 Bypass",
      "tenderName": "Highway NH-48 Extension",
      "penaltyValue": 350000
    },
    {
      "_id": "TND-008",
      "projectName": "Metro Phase 2",
      "tenderName": "Metro Rail Extension",
      "penaltyValue": 200000
    }
  ]
}
```

**Suggested UI**:
- Alert card (red/orange): Total penalty value and affected tenders count
- Bar chart or table: Project-wise penalty breakdown (top 10)

---

### 5. `purchaseRequests`

**Permission**: `purchase.request.read`
**Purpose**: Purchase request pipeline status + recent request & quotation details

```json
{
  "counts": {
    "requestRaised": 8,
    "quotationRequested": 3,
    "quotationReceived": 5,
    "vendorApproved": 2,
    "purchaseOrderIssued": 12,
    "completed": 25,
    "total": 55
  },
  "recentRaised": [
    {
      "requestId": "PR-055",
      "title": "Steel TMT Bars",
      "projectId": "TND-012",
      "tender_project_name": "NH-48 Bypass",
      "requestDate": "2026-03-05T00:00:00.000Z",
      "requiredByDate": "2026-03-15T00:00:00.000Z",
      "status": "Request Raised"
    }
  ],
  "recentQuotationReceived": [
    {
      "requestId": "PR-048",
      "title": "Cement OPC 53",
      "projectId": "TND-008",
      "tender_project_name": "Metro Phase 2",
      "requestDate": "2026-02-28T00:00:00.000Z",
      "requiredByDate": "2026-03-10T00:00:00.000Z",
      "status": "Quotation Received",
      "vendorQuotations": [
        {
          "quotationId": "QT-A8K2F",
          "vendorName": "ABC Traders",
          "totalQuotedValue": 450000,
          "approvalStatus": "Pending"
        },
        {
          "quotationId": "QT-M3P9R",
          "vendorName": "XYZ Suppliers",
          "totalQuotedValue": 420000,
          "approvalStatus": "Pending"
        }
      ]
    }
  ]
}
```

**Suggested UI**:
- Horizontal pipeline/funnel chart for counts
- "Recent Requests" mini-table: 5 latest Request Raised items with project, date, required by
- "Quotations Received" mini-table: 5 latest with vendor names and quoted values

| Status | Color |
|--------|-------|
| `requestRaised` | Blue |
| `quotationRequested` | Indigo |
| `quotationReceived` | Yellow |
| `vendorApproved` | Orange |
| `purchaseOrderIssued` | Green |
| `completed` | Grey |

---

### 6. `workOrders`

**Permission**: `project.wo_issuance.read`
**Purpose**: Work order pipeline status + recent request & quotation details

```json
{
  "counts": {
    "requestRaised": 4,
    "quotationReceived": 2,
    "vendorApproved": 1,
    "workOrderIssued": 8,
    "completed": 15,
    "total": 30
  },
  "recentRaised": [
    {
      "requestId": "WO-030",
      "title": "Earthwork Excavation",
      "projectId": "TND-012",
      "tender_project_name": "NH-48 Bypass",
      "requestDate": "2026-03-04T00:00:00.000Z",
      "requiredByDate": "2026-03-20T00:00:00.000Z",
      "status": "Request Raised"
    }
  ],
  "recentQuotationReceived": [
    {
      "requestId": "WO-025",
      "title": "RCC Work Block-A",
      "projectId": "TND-008",
      "tender_project_name": "Metro Phase 2",
      "requestDate": "2026-02-25T00:00:00.000Z",
      "requiredByDate": "2026-03-12T00:00:00.000Z",
      "status": "Quotation Received",
      "vendorQuotations": [
        {
          "quotationId": "QT-W2K8N",
          "vendorName": "BuildPro Contractors",
          "totalQuotedValue": 1200000,
          "approvalStatus": "Pending"
        }
      ]
    }
  ]
}
```

**Suggested UI**: Same pipeline/funnel style as purchase requests, with "Recent Raised" and "Quotations Received" mini-tables.

---

### 7. `billing`

**Permission**: `project.client_billing.read` OR `finance.client_billing.read`
**Purpose**: Client billing status, totals, and project-based breakdown

```json
{
  "draft": 3,
  "submitted": 2,
  "approved": 5,
  "paid": 10,
  "totalBilled": 45000000,
  "billCount": 20,
  "byProject": [
    {
      "tenderId": "TND-012",
      "projectName": "NH-48 Bypass",
      "tenderName": "Highway NH-48 Extension",
      "billCount": 8,
      "totalBilled": 25000000,
      "draft": 1,
      "submitted": 1,
      "approved": 3,
      "paid": 3
    },
    {
      "tenderId": "TND-008",
      "projectName": "Metro Phase 2",
      "tenderName": "Metro Rail Extension",
      "billCount": 5,
      "totalBilled": 12000000,
      "draft": 0,
      "submitted": 1,
      "approved": 2,
      "paid": 2
    }
  ]
}
```

**Suggested UI**:
- Stat card: Total Billed Amount (formatted as currency)
- Mini donut: Draft / Submitted / Approved / Paid
- Badge: Total bill count
- Table/Accordion: Project-wise billing breakdown (top 10 by amount)

---

### 8. `employees`

**Permission**: `hr.employee.read`
**Purpose**: Workforce breakdown

```json
{
  "byStatus": {
    "Active": 220,
    "Inactive": 15,
    "Suspended": 2
  },
  "byDepartment": {
    "Civil": 80,
    "Electrical": 45,
    "Mechanical": 30,
    "HR": 12,
    "Accounts": 10,
    "IT": 8,
    "Admin": 5,
    "Plumbing": 15,
    "Safety": 10,
    "Survey": 5
  },
  "byUserType": {
    "Office": 90,
    "Site": 130
  },
  "total": 237
}
```

**Suggested UI**:
- Stat cards: Active / Inactive / Suspended
- Bar chart: Top 10 departments
- Pie chart: Office vs Site split

---

### 9. `todayAttendance`

**Permission**: `hr.attendance.read`
**Purpose**: Today's real-time attendance snapshot

```json
{
  "present": 180,
  "absent": 10,
  "halfDay": 5,
  "onLeave": 15,
  "late": 8,
  "notYetPunched": 20,
  "totalActive": 230
}
```

**Suggested UI**: Attendance ring/donut chart with the following segments

| Segment | Color | Label |
|---------|-------|-------|
| `present` | Green | Present |
| `absent` | Red | Absent |
| `halfDay` | Orange | Half Day |
| `onLeave` | Blue | On Leave |
| `notYetPunched` | Grey | Not Punched |

Additional badges:
- Late entries: `late` count (warning badge)
- Center label: `present / totalActive` (e.g., "180/230")

---

### 10. `pendingLeaves`

**Permission**: `hr.leave.read`
**Purpose**: Leave requests awaiting approval

**Behavior**:
- **HR users** (with `hr.leave.edit` permission): See ALL pending leaves
- **Managers**: See only their direct reports' pending leaves
- **Others**: Empty (0 pending, no requests)

```json
{
  "pendingCount": 7,
  "requests": [
    {
      "employeeId": {
        "_id": "665f...",
        "name": "Ravi Kumar",
        "employeeId": "EMP-042",
        "department": "Civil",
        "designation": "Site Engineer"
      },
      "leaveType": "CL",
      "requestType": "Full Day",
      "fromDate": "2026-03-10T00:00:00.000Z",
      "toDate": "2026-03-12T00:00:00.000Z",
      "totalDays": 3,
      "status": "Pending",
      "createdAt": "2026-03-06T08:30:00.000Z"
    }
  ]
}
```

**Suggested UI**:
- Badge/counter: `pendingCount` (with attention indicator if > 0)
- Mini table or list showing the 5 most recent requests
- Each row: Employee name, leave type, dates, days count
- Click to navigate to leave approval page

---

### 11. `machinery`

**Permission**: `project.assets.read` OR `site.site_assets.read`
**Purpose**: Machinery fleet status + compliance alerts

```json
{
  "byStatus": {
    "Active": 25,
    "Idle": 8,
    "Maintenance": 3,
    "Breakdown": 1,
    "Scrapped": 2
  },
  "total": 39,
  "expiringComplianceCount": 4
}
```

**Suggested UI**:
- Status pills: Active (green), Idle (grey), Maintenance (yellow), Breakdown (red)
- Alert badge: `expiringComplianceCount` — compliance documents expiring within 30 days
  - If > 0, show a warning: "4 assets have compliance expiring soon"

---

### 12. `myWorkProfile`

**Permission**: Always present (any logged-in user)
**Purpose**: Employee's own attendance, leave balance, and recent leave applications

```json
{
  "todayAttendance": {
    "status": "Present",
    "punchIn": {
      "time": "2026-03-06T09:02:00.000Z",
      "location": { "latitude": 12.9716, "longitude": 77.5946 },
      "photo": "https://s3.../punch-in.jpg"
    },
    "punchOut": null,
    "flags": {
      "isLateEntry": false,
      "isEarlyExit": false
    },
    "totalWorkingHours": 4.5
  },
  "leaveBalance": {
    "PL": 12,
    "CL": 6,
    "SL": 6,
    "compOff": 2
  },
  "recentLeaveApplications": [
    {
      "leaveType": "CL",
      "requestType": "Full Day",
      "fromDate": "2026-03-10T00:00:00.000Z",
      "toDate": "2026-03-12T00:00:00.000Z",
      "totalDays": 3,
      "status": "Pending",
      "reason": "Family function",
      "createdAt": "2026-03-06T08:30:00.000Z"
    }
  ]
}
```

**If not punched in yet**:
```json
{
  "todayAttendance": { "status": "Not Punched" },
  "leaveBalance": { ... },
  "recentLeaveApplications": [ ... ]
}
```

**Suggested UI**:
- **Attendance card**: Today's status (Present/Absent/Not Punched), punch-in time, working hours so far
- **Leave balance**: 4 mini stat cards — PL, CL, SL, CompOff with remaining count
- **Recent applications**: Mini table with 5 latest leave applications, status badge (Pending=yellow, Approved=green, Rejected=red)

| Leave Type | Label |
|------------|-------|
| `PL` | Privilege Leave |
| `CL` | Casual Leave |
| `SL` | Sick Leave |
| `compOff` | Compensatory Off |

---

### 13. `upcomingDeadlines`

**Permission**: `tender.tenders.read`
**Purpose**: Tenders with submission deadlines within 15 days

```json
{
  "count": 3,
  "upcoming": [
    {
      "tender_id": "TND-050",
      "tender_name": "Bridge Construction NH-7",
      "tender_project_name": "NH-7 Bridge Project",
      "tender_end_date": "2026-03-12T00:00:00.000Z",
      "tender_status": "PENDING",
      "tender_value": 8500000,
      "client_name": "NHAI"
    }
  ]
}
```

**Suggested UI**:
- Alert card: "3 tenders due within 15 days"
- List/table: Tender name, project, client, due date, days remaining
- Color code by urgency:
  - < 3 days: Red
  - 3-7 days: Orange
  - 7-15 days: Yellow

---

### 14. `notifications`

**Permission**: Always present (any logged-in user)
**Purpose**: Notification bell data for the dashboard

```json
{
  "unreadCount": 7,
  "recent": [
    {
      "_id": "665f...",
      "title": "Leave Approved",
      "message": "Your CL leave from 10/03/2026 to 12/03/2026 has been approved.",
      "category": "approval",
      "priority": "medium",
      "module": "hr",
      "actionUrl": "/dashboard/profile",
      "createdAt": "2026-03-06T10:30:00.000Z"
    }
  ]
}
```

**Suggested UI**:
- Bell icon with `unreadCount` badge
- Dropdown showing 5 recent notifications
- Each item: icon (from `category`), title, relative time
- Click navigates to `actionUrl`

---

## Permission-to-Section Mapping

Quick reference for conditionally rendering sections:

```js
const sectionPermissions = {
  overview:          "dashboard.read",
  tenderPipeline:    "tender.tenders.read",
  emdSummary:        "tender.emd.read",
  penaltySummary:    "tender.project_penalty.read",
  purchaseRequests:  "purchase.request.read",
  workOrders:        "project.wo_issuance.read",
  billing:           "project.client_billing.read || finance.client_billing.read",
  employees:         "hr.employee.read",
  todayAttendance:   "hr.attendance.read",
  pendingLeaves:     "hr.leave.read",
  machinery:         "project.assets.read || site.site_assets.read",
  myWorkProfile:     "always",
  upcomingDeadlines: "tender.tenders.read",
  notifications:     "always"
};
```

**But the simplest approach**: Just check if the key exists in the response.

```js
const { data } = await api.get("/dashboard");

// Render only what's returned
Object.keys(data).forEach(section => {
  renderSection(section, data[section]);
});
```

---

## Role Examples

### Admin (DEV role — all permissions)
Gets all 14 sections. Full dashboard.

### Site Engineer (site + project permissions only)
Gets: `overview`, `workOrders`, `machinery`, `myWorkProfile`, `notifications`
All data scoped to their assigned projects.

### HR Manager (hr permissions)
Gets: `overview`, `employees`, `todayAttendance`, `pendingLeaves`, `myWorkProfile`, `notifications`
Pending leaves shows ALL employees (has `hr.leave.edit`).

### Purchase Manager (purchase + tender permissions)
Gets: `overview`, `tenderPipeline`, `purchaseRequests`, `upcomingDeadlines`, `myWorkProfile`, `notifications`

### Finance (finance + tender permissions)
Gets: `overview`, `tenderPipeline`, `emdSummary`, `penaltySummary`, `billing`, `upcomingDeadlines`, `myWorkProfile`, `notifications`

### Regular Manager (limited permissions, has team reports)
Gets: `overview`, `pendingLeaves` (team only), `myWorkProfile`, `notifications`

---

## Frontend Integration Tips

### Fetching Dashboard Data
```js
// Call once on page load
const response = await axios.get("/dashboard", { withCredentials: true });
const dashboard = response.data.data;
```

### Conditional Rendering Pattern (React)
```jsx
function Dashboard({ data }) {
  return (
    <div className="dashboard-grid">
      {/* Always show overview if available */}
      {data.overview && <OverviewCards data={data.overview} />}

      {/* My Work Profile — always present */}
      {data.myWorkProfile && <MyWorkProfile data={data.myWorkProfile} />}

      {/* Upcoming Deadlines alert */}
      {data.upcomingDeadlines?.count > 0 && (
        <UpcomingDeadlines data={data.upcomingDeadlines} />
      )}

      {/* Attendance + Leaves row */}
      <div className="row">
        {data.todayAttendance && <AttendanceRing data={data.todayAttendance} />}
        {data.pendingLeaves && <PendingLeaves data={data.pendingLeaves} />}
      </div>

      {/* Pipeline charts row */}
      <div className="row">
        {data.tenderPipeline && <TenderPipeline data={data.tenderPipeline} />}
        {data.purchaseRequests && <PurchasePipeline data={data.purchaseRequests} />}
        {data.workOrders && <WorkOrderPipeline data={data.workOrders} />}
      </div>

      {/* Financial row */}
      <div className="row">
        {data.emdSummary && <EmdSummary data={data.emdSummary} />}
        {data.billing && <BillingSummary data={data.billing} />}
        {data.penaltySummary && <PenaltyAlert data={data.penaltySummary} />}
      </div>

      {/* HR row */}
      <div className="row">
        {data.employees && <EmployeeBreakdown data={data.employees} />}
      </div>

      {/* Assets row */}
      <div className="row">
        {data.machinery && <MachineryStatus data={data.machinery} />}
      </div>

      {/* Notifications - always present */}
      {data.notifications && <NotificationBell data={data.notifications} />}
    </div>
  );
}
```

### Suggested Dashboard Grid Layout
```
+---------------------------------------------------+
|  [Tenders]  [Projects]  [Employees]  [Vendors]  [Clients]  |  <- overview cards
+---------------------------------------------------+
|  My Work Profile (attendance + leave balance)      |  <- always visible
+---------------------------------------------------+
|  Upcoming Deadlines (alert banner if any)          |
+---------------------------------------------------+
|  Attendance Ring    |   Pending Leaves (list)      |
+---------------------------------------------------+
|  Tender Pipeline (chart)  |  Purchase Pipeline     |
+---------------------------------------------------+
|  Work Orders Pipeline  |  Quotations Received      |
+---------------------------------------------------+
|  EMD Summary     |  Billing Summary  |  Penalties  |
|                  |  + Project table  |  + Project  |
+---------------------------------------------------+
|  Employees by Dept (bar chart)                     |
+---------------------------------------------------+
|  Machinery Status + Compliance Alerts              |
+---------------------------------------------------+
```

### Refresh Strategy
- Fetch dashboard on page load
- Optional: Auto-refresh every 2-5 minutes for attendance data
- Or provide a manual refresh button
- Notifications section can be polled independently via `GET /notification/unread-count`

### Number Formatting
```js
// For currency values (INR)
const formatCurrency = (value) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value);

// Usage: formatCurrency(45000000) => "₹4,50,00,000"
```

### Days Remaining Helper (for deadlines)
```js
const daysRemaining = (dateStr) => {
  const diff = new Date(dateStr) - new Date();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
};

// Color code
const getDeadlineColor = (days) => {
  if (days <= 3) return "red";
  if (days <= 7) return "orange";
  return "yellow";
};
```

---

## Error Response

```json
{
  "status": false,
  "message": "Error description"
}
```

If the user has no role assigned:
```json
{
  "status": true,
  "data": {
    "message": "No role assigned"
  }
}
```
