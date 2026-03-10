# Contractor & Contract Worker API Documentation

Base URL: `/contractor` and `/contractworker`

---

## Contractor APIs

### 1. Create Contractor

`POST /contractor/add`

**Request Body:**

```json
{
  "company_name": "ABC Constructions",
  "contact_person": "Rajesh Kumar",
  "contact_phone": "9876543210",
  "contact_email": "rajesh@abc.com",
  "address": {
    "street": "123 Main Road",
    "city": "Chennai",
    "state": "Tamil Nadu",
    "country": "India",
    "pincode": "600001"
  },
  "business_type": "Civil",
  "license_number": "LIC-2025-001",
  "gst_number": "33AABCU9603R1ZM",
  "pan_number": "AABCU9603R",
  "contract_start_date": "2026-01-01",
  "contract_end_date": "2026-12-31",
  "remarks": "Preferred civil contractor"
}
```

**Response:** `201`

```json
{
  "status": true,
  "message": "Contractor created",
  "data": {
    "contractor_id": "CON-001",
    "company_name": "ABC Constructions",
    "assigned_projects": [],
    "account_details": {},
    "employees": [],
    "total_employees": 0,
    "status": "ACTIVE",
    "...": "all fields"
  }
}
```

---

### 2. Get All Contractors

`GET /contractor/getall`

**Response:** `200`

```json
{
  "status": true,
  "data": [ { "contractor_id": "CON-001", "..." : "..." } ]
}
```

---

### 3. Get Contractors — Dropdown

`GET /contractor/getallselect`

Returns only `contractor_id` and `company_name`. Use for dropdowns/select inputs.

**Response:** `200`

```json
{
  "status": true,
  "data": [
    { "contractor_id": "CON-001", "company_name": "ABC Constructions" },
    { "contractor_id": "CON-002", "company_name": "XYZ Builders" }
  ]
}
```

---

### 4. Get Single Contractor

`GET /contractor/get/:contractor_id`

**Example:** `GET /contractor/get/CON-001`

**Response:** `200`

```json
{
  "status": true,
  "data": {
    "contractor_id": "CON-001",
    "company_name": "ABC Constructions",
    "assigned_projects": [...],
    "account_details": {...},
    "employees": ["CW-001", "CW-002"],
    "total_employees": 2,
    "..."
  }
}
```

---

### 5. Get Active Contractors

`GET /contractor/getactive`

Returns only contractors with `status: "ACTIVE"`.

---

### 6. Paginated Contractor List

`GET /contractor/contractorlist`

**Query Params:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `page` | number | 1 | Page number |
| `limit` | number | 10 | Items per page |
| `search` | string | "" | Search by company_name, email, phone, contractor_id |
| `fromdate` | date string | — | Filter from date (createdAt) |
| `todate` | date string | — | Filter to date (createdAt) |

**Example:** `GET /contractor/contractorlist?page=1&limit=10&search=ABC`

**Response:** `200`

```json
{
  "status": true,
  "currentPage": 1,
  "totalPages": 3,
  "totalRecords": 25,
  "data": [ { "contractor_id": "CON-001", "..." : "..." } ]
}
```

---

### 7. Search Contractors

`GET /contractor/search?q=ABC`

Searches across `company_name`, `contact_email`, `contact_phone`.

---

### 8. Update Contractor

`PUT /contractor/update/:contractor_id`

**Example:** `PUT /contractor/update/CON-001`

**Request Body:** (partial update — send only fields to change)

```json
{
  "contact_phone": "9999999999",
  "status": "SUSPENDED"
}
```

**Response:** `200`

```json
{
  "status": true,
  "message": "Contractor updated",
  "data": { "..." }
}
```

---

### 9. Delete Contractor (Soft Delete)

`DELETE /contractor/delete/:contractor_id`

Sets `isDeleted: true` and `status: "INACTIVE"`. Data is preserved.

**Response:** `200`

```json
{ "status": true, "message": "Contractor deleted" }
```

---

### 10. Get Contractor with All Employees

`GET /contractor/get/:contractor_id/employees`

Returns full contractor details + all linked contract workers.

**Example:** `GET /contractor/get/CON-001/employees`

**Response:** `200`

```json
{
  "status": true,
  "data": {
    "contractor_id": "CON-001",
    "company_name": "ABC Constructions",
    "total_employees": 3,
    "assigned_projects": [
      { "tender_id": "TND-001", "project_name": "Highway Phase 2", "status": "active" }
    ],
    "account_details": {
      "bank_name": "SBI",
      "account_number": "XXXX1234",
      "ifsc_code": "SBIN0001234"
    },
    "employees": [
      {
        "worker_id": "CW-001",
        "employee_name": "Suresh",
        "contractor_id": "CON-001",
        "role": "Mason",
        "daily_wage": 800,
        "site_assigned": "Site A",
        "status": "ACTIVE"
      },
      {
        "worker_id": "CW-002",
        "employee_name": "Ramesh",
        "contractor_id": "CON-001",
        "role": "Helper",
        "daily_wage": 500,
        "site_assigned": "Site A",
        "status": "ACTIVE"
      }
    ]
  }
}
```

---

### 11. Get Contractor Employees — Paginated

`GET /contractor/get/:contractor_id/employees/paginated`

**Query Params:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `page` | number | 1 | Page number |
| `limit` | number | 10 | Items per page |
| `search` | string | "" | Search by employee_name, phone, role |

**Example:** `GET /contractor/get/CON-001/employees/paginated?page=1&limit=5&search=mason`

**Response:** `200`

```json
{
  "status": true,
  "currentPage": 1,
  "totalPages": 1,
  "totalRecords": 3,
  "data": [ { "worker_id": "CW-001", "..." } ]
}
```

---

### 12. Get Assigned Projects

`GET /contractor/get/:contractor_id/projects`

**Response:** `200`

```json
{
  "status": true,
  "data": {
    "contractor_id": "CON-001",
    "company_name": "ABC Constructions",
    "assigned_projects": [
      {
        "tender_id": "TND-001",
        "project_name": "Highway Phase 2",
        "assigned_date": "2026-01-15T00:00:00.000Z",
        "status": "active"
      },
      {
        "tender_id": "TND-003",
        "project_name": "Bridge Repair",
        "assigned_date": "2026-03-01T00:00:00.000Z",
        "status": "completed"
      }
    ]
  }
}
```

---

### 13. Assign Project to Contractor

`POST /contractor/get/:contractor_id/assign-project`

**Request Body:**

```json
{
  "tender_id": "TND-005",
  "project_name": "Metro Station Phase 3",
  "assigned_date": "2026-03-10"
}
```

**Response:** `200`

```json
{ "status": true, "message": "Project assigned", "data": { "..." } }
```

---

### 14. Remove Project Assignment

`PUT /contractor/get/:contractor_id/remove-project/:tender_id`

Sets project status to `"withdrawn"`. Does not delete the entry.

**Example:** `PUT /contractor/get/CON-001/remove-project/TND-005`

**Response:** `200`

```json
{ "status": true, "message": "Project withdrawn", "data": { "..." } }
```

---

### 15. Update Account / Bank Details

`PUT /contractor/update/:contractor_id/account`

**Request Body:**

```json
{
  "bank_name": "State Bank of India",
  "branch_name": "Anna Nagar",
  "account_number": "1234567890",
  "ifsc_code": "SBIN0001234",
  "account_holder_name": "ABC Constructions Pvt Ltd",
  "upi_id": "abc@sbi",
  "payment_terms": "Net 30"
}
```

**Response:** `200`

```json
{ "status": true, "message": "Account details updated", "data": { "..." } }
```

---

### 16. Dashboard Stats

`GET /contractor/dashboard-stats`

**Response:** `200`

```json
{
  "status": true,
  "data": {
    "total_contractors": 25,
    "active_contractors": 18,
    "total_contract_workers": 156,
    "active_workers": 130
  }
}
```

---

---

## Contract Worker APIs

### 1. Create Worker

`POST /contractworker/addworker`

**Important:** `contractor_id` is **required**. The worker is automatically linked to the contractor.

**Request Body:**

```json
{
  "contractor_id": "CON-001",
  "employee_name": "Suresh Kumar",
  "contact_phone": "9876543210",
  "gender": "Male",
  "age": 35,
  "address": {
    "street": "45 Gandhi Street",
    "city": "Chennai",
    "state": "Tamil Nadu",
    "country": "India",
    "pincode": "600002"
  },
  "id_proof_type": "Aadhaar",
  "id_proof_number": "1234-5678-9012",
  "site_assigned": "Highway Phase 2 - Site A",
  "role": "Mason",
  "daily_wage": 800
}
```

**Response:** `201`

```json
{
  "status": true,
  "message": "Worker created",
  "data": {
    "worker_id": "CW-001",
    "contractor_id": "CON-001",
    "employee_name": "Suresh Kumar",
    "status": "ACTIVE",
    "..."
  }
}
```

**Side Effect:** Contractor's `employees[]` gets `"CW-001"` pushed, `total_employees` increments by 1.

---

### 2. Get All Workers

`GET /contractworker/getallworkers`

---

### 3. Get Workers — Dropdown

`GET /contractworker/getallContractorId`

Returns only `worker_id`, `employee_name`, `contractor_id`.

---

### 4. Get Single Worker

`GET /contractworker/getworker/:worker_id`

**Example:** `GET /contractworker/getworker/CW-001`

---

### 5. Get Active Workers

`GET /contractworker/getactiveworkers`

---

### 6. Search Workers

`GET /contractworker/searchworkers?q=mason`

Searches across `employee_name`, `contact_phone`, `role`.

---

### 7. Paginated Workers List

`GET /contractworker/getcontractworker`

**Query Params:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `page` | number | 1 | Page number |
| `limit` | number | 10 | Items per page |
| `search` | string | "" | Search by name, contractor_id, phone, site |
| `fromdate` | date string | — | Filter from date |
| `todate` | date string | — | Filter to date |

---

### 8. Update Worker

`PUT /contractworker/updateworker/:worker_id`

**Request Body:** (partial update)

```json
{
  "role": "Fitter",
  "daily_wage": 900
}
```

---

### 9. Delete Worker (Soft Delete)

`DELETE /contractworker/deleteworker/:worker_id`

Sets `isDeleted: true`, `status: "LEFT"`.

**Side Effect:** Automatically removes `worker_id` from contractor's `employees[]` and decrements `total_employees`.

---

### 10. Get All Workers by Contractor

`GET /contractworker/bycontractor/:contractor_id`

**Example:** `GET /contractworker/bycontractor/CON-001`

Returns all workers linked to that contractor.

**Response:** `200`

```json
{
  "status": true,
  "data": [
    { "worker_id": "CW-001", "employee_name": "Suresh", "role": "Mason", "..." },
    { "worker_id": "CW-002", "employee_name": "Ramesh", "role": "Helper", "..." }
  ]
}
```

---

### 11. Transfer Worker to Another Contractor

`POST /contractworker/transfer/:worker_id`

Moves a worker from their current contractor to a new one. Updates both contractors automatically.

**Request Body:**

```json
{
  "new_contractor_id": "CON-003"
}
```

**Response:** `200`

```json
{
  "status": true,
  "message": "Worker transferred",
  "data": {
    "worker_id": "CW-001",
    "contractor_id": "CON-003",
    "..."
  }
}
```

**Side Effects:**
- Old contractor: `employees[]` removes `"CW-001"`, `total_employees` -1
- New contractor: `employees[]` gets `"CW-001"`, `total_employees` +1

---

### 12. Assign / Change Site

`PUT /contractworker/assign-site/:worker_id`

**Request Body:**

```json
{
  "site_assigned": "Metro Station Phase 3 - Zone B"
}
```

**Response:** `200`

```json
{ "status": true, "message": "Site assigned", "data": { "..." } }
```

---

## Data Models Reference

### Contractor Schema

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `contractor_id` | String | auto | Unique ID (CON-001) |
| `company_name` | String | yes | Company name |
| `contact_person` | String | no | Primary contact name |
| `contact_phone` | String | no | Phone number |
| `contact_email` | String | no | Email |
| `address` | Object | no | `{ street, city, state, country, pincode }` |
| `business_type` | String | no | Civil, Electrical, Plumbing, etc. |
| `license_number` | String | no | Registration/license number |
| `gst_number` | String | no | GST number |
| `pan_number` | String | no | PAN number |
| `contract_start_date` | Date | no | Contract start |
| `contract_end_date` | Date | no | Contract end |
| `status` | String | no | `ACTIVE` / `INACTIVE` / `SUSPENDED` / `BLACKLISTED` |
| `assigned_projects` | Array | no | `[{ tender_id, project_name, assigned_date, status }]` |
| `account_details` | Object | no | `{ bank_name, branch_name, account_number, ifsc_code, account_holder_name, upi_id, payment_terms }` |
| `employees` | Array | auto | Worker IDs (auto-managed) |
| `total_employees` | Number | auto | Count (auto-managed) |
| `remarks` | String | no | Notes |

### Contract Worker Schema

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `worker_id` | String | auto | Unique ID (CW-001) |
| `contractor_id` | String | **yes** | Linked contractor ID |
| `employee_name` | String | yes | Full name |
| `contact_phone` | String | no | Phone |
| `gender` | String | no | Gender |
| `age` | Number | no | Age |
| `address` | Object | no | `{ street, city, state, country, pincode }` |
| `id_proof_type` | String | no | Aadhaar, PAN, Voter ID, etc. |
| `id_proof_number` | String | no | ID number |
| `photo` | String | no | S3 key for photo |
| `site_assigned` | String | no | Current site |
| `role` | String | no | Mason, Helper, Fitter, etc. |
| `daily_wage` | Number | no | Wage per day |
| `status` | String | no | `ACTIVE` / `INACTIVE` / `LEFT` |

---

## Status Enums

**Contractor status:** `ACTIVE`, `INACTIVE`, `SUSPENDED`, `BLACKLISTED`

**Worker status:** `ACTIVE`, `INACTIVE`, `LEFT`

**Project assignment status:** `active`, `completed`, `withdrawn`

---

## Error Responses

All errors follow this format:

```json
{ "status": false, "message": "Error description" }
```

| Status Code | Meaning |
|-------------|---------|
| `400` | Bad request (missing required field) |
| `404` | Contractor or worker not found |
| `500` | Server error |
