# Department + HOD Directory

Base path: `/department` — HR-managed directory of departments with optional `headId` (HOD). Used by the leave-approval engine to route the middle stage between Manager and HR.

See [README.md](README.md) for shared conventions and [leave-api.md](leave-api.md) for the 3-stage approval pipeline.

---

## 1. Why this module exists

`Employee.department` is still a **String** field (legacy schema). To enable HOD approval routing without a data migration, this module bridges the string name to a structured record holding the HOD's `_id`.

```
Employee.department ("Engineering")
  ↓ string match
Department.name ("Engineering")
  → Department.headId  (Employee _id)  ← the HOD
```

The HOD is consulted by `LeavePolicyService.resolveHODForEmployee(employee)` when the resolved `LeavePolicyRule.requiresHODApproval` is true. If no Department row exists or `headId` is null, the HOD step is silently skipped (logged as a warning) — the leave routes Manager → HR directly.

---

## 2. Schema

```jsonc
{
  name,                              // e.g. "Engineering" — must match Employee.department
  code,                              // optional — e.g. "ENG" (uppercase)
  headId,                            // Employee _id — the HOD
  parentDepartmentId,                // optional — for nested org charts
  description,
  isActive,
  createdBy, updatedBy
}
```

Unique on `name`. The `headId` populate carries `name`, `employeeId`, `designation`, `email`.

---

## 3. Endpoint catalog

| Method | Path | Permission |
|---|---|---|
| POST | `/department/upsert` | `hr.employee.edit` |
| GET | `/department/list?isActive=&search=&page=&limit=` | `hr.employee.read` |
| GET | `/department/:id` | `hr.employee.read` |
| DELETE | `/department/:id` | `hr.employee.delete` |

---

## 4. Detailed specs

### POST `/department/upsert`

Idempotent on `name`.

```jsonc
{
  "name": "Engineering",
  "code": "ENG",
  "headId": "<Employee _id of the HOD>",
  "parentDepartmentId": null,
  "description": "Software + hardware engineering teams",
  "isActive": true
}

// 200 — { status:true, message:"Department saved", data:<doc> }
```

UI: HR Admin → Departments → "Add / Edit". Form with an HOD typeahead bound to `/employee/list`.

### GET `/department/list`

Paginated. The `headId` field is populated with light employee details for direct display.

```jsonc
{ "data": [
  { "_id", "name":"Engineering", "code":"ENG", "isActive":true,
    "headId": { "_id", "name":"Suresh K", "employeeId":"EMP-007", "designation":"Engineering Lead", "email":"..." },
    "description", "parentDepartmentId" },
  ...
] }
```

UI: HR Admin → Departments index page. Table columns: Name, Code, HOD (with avatar + employeeId), Active toggle.

### GET `/department/:id`

Single record by `_id`. Same populate.

### DELETE `/department/:id`

Hard delete. Confirmation required. After delete, leaves applied by employees in that department fall back to DEFAULT-scoped policy resolution + skip HOD.

---

## 5. UI design ideas

### HR Admin — Departments page

```
┌─ Departments ─────────────────────────────────────────────────────┐
│  [+ Add department]   [Search ...]                                │
├────────────────────────────────────────────────────────────────────┤
│ Name              Code   HOD                  Active   Actions     │
│ Engineering       ENG    Suresh K (EMP-007)   ●        [edit][×]   │
│ Site Operations   OPS    Anand R  (EMP-014)   ●        [edit][×]   │
│ Finance           FIN    —                    ●        [edit][×]   │
│ HR & Admin        HRA    Priya K (EMP-002)    ●        [edit][×]   │
└────────────────────────────────────────────────────────────────────┘
```

A small badge "No HOD set" warns when `headId` is null and the department has at least one LeavePolicyRule with `requiresHODApproval=true`.

### Add / Edit modal

```
┌─ Edit department ─────────────────────────────────────┐
│  Name *      [ Engineering            ]                │
│  Code        [ ENG                    ]                │
│  HOD         [ Suresh K (EMP-007) v   ]   [×]          │
│  Parent      [ —                      v ]              │
│  Description [ ...                    ]                │
│  Active      [✔]                                       │
│                                                         │
│                       [Cancel]    [Save]                │
└─────────────────────────────────────────────────────────┘
```

The HOD typeahead should:
- Search across `name + employeeId` via `/employee/list?search=...`
- Show the avatar + designation in each option
- Allow clearing (sets `headId` to null)

### Org chart tree (optional, advanced)

If `parentDepartmentId` is used, render a tree:

```
HR & Admin
├─ Recruitment
└─ Payroll

Engineering
├─ Backend
└─ Frontend

Site Operations
├─ Tower 1
└─ Tower 2
```

This is purely an HR navigation aid; it has no functional impact on approval routing today (HOD is resolved per-leaf department, not via the parent chain).

### Department dropdown across the app

Anywhere in the system you need a department picker — Apply-Leave coverage selector, Filter widgets on reports, the LeavePolicy / WeeklyOffPolicy `scope` field — driving from `/department/list?isActive=true` keeps values consistent. (The current `Employee.department` field is freeform string, so dropdown options can lag — recommend HR fixes that as part of department admin work.)

---

## 6. Where the HOD pipeline kicks in

```
Employee applies leave (department: "Engineering")
   ↓
LeavePolicy.resolveForEmployee → Engineering rule says requiresHODApproval=true, hodMinDays=5
   ↓
Manager approves request (3-day leave)        →  hodMinDays not met, route directly to HR
Manager approves request (7-day leave)        →  needs HOD, resolveHODForEmployee:
                                                   Department.findByName("Engineering").headId  →  EMP-007
                                                   Notify EMP-007
   ↓
HOD (EMP-007) approves                         →  HOD Approved
   ↓
HR approves                                    →  HR Approved (final)
```

If at any point the resolution fails (department row missing, headId null), HOD is skipped and the warning logged — leave still completes via Manager → HR.

---

## 7. Integration notes / gotchas

- **`name` is the join key**. Make sure HR uses the exact same string in `Employee.department` and `Department.name`. A mismatch silently disables HOD routing — there's no error.
- **Soft state** — there's no soft-delete on Department. `isActive=false` is your equivalent: the resolver requires `isActive: true`. Toggle it off rather than deleting if employees still reference the department string.
- **No effective-dating** — current state only. To rotate HOD, just upsert a new `headId`. Past leaves are unaffected (their workflowLogs already record who approved them).
- **HOD ≠ Manager** — `Employee.reportsTo` (manager) and `Department.headId` (HOD) are independent. A given user can hit your queue under multiple roles simultaneously; `/leave/my-pending-approvals` returns all three buckets.
- **No role check on HOD** — the HOD doesn't need any HR permission to approve, they just need to be the `headId` of a department where the leave's policy requires HOD. This is a deliberate design (HOD authority comes from the org chart, not from RBAC).

---

## 8. Cross-references

- 3-stage approval flow + `getMyPendingApprovals.asHOD` → [leave-api.md](leave-api.md)
- HOD opt-in fields on the rule (`requiresHODApproval`, `hodMinDays`) → [leave-policy.md](leave-policy.md)
- Department string match origin (`Employee.department`) → [employee-api.md](employee-api.md)
