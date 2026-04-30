# NMR Attendance (Contractor / Daily Wage Workers)

Base path: `/nmrattendance` — separate flow for **Non-Muster Roll** workers (contractor labour) which doesn't share the multi-punch / shift / leave-balance machinery used for full-time `Employee` records. Site supervisors record contractor attendance day-by-day, optionally seeded from the DLP (Daily Labour Plan).

See [README.md](README.md) for shared conventions. NMR is a **side flow**, semi-independent from the rest of HR — leave/payroll do not apply.

---

## 1. Why NMR is separate

| Concern | Employee (User Attendance) | NMR (Contractor Worker) |
|---|---|---|
| Source of identity | `Employee` (auth user) | `ContractEmployee` / `Contractor` |
| Attendance shape | multi-punch, sessions, geofence, photo | one row per day, marked Present / Absent / Half-Day by supervisor |
| Leave / Payroll | yes | no — billed via weekly/monthly contractor invoice |
| Approval flow | regularization | supervisor verification |
| Reports | calendar, late, OT | per-project headcount + summary |

---

## 2. Endpoint catalog

All routes are `verifyJWT` only — no specific `hr.nmr` permission key today.

| Method | Path | Use |
|---|---|---|
| POST | `/nmrattendance/api/create` | record one NMR row |
| POST | `/nmrattendance/api/create-from-dlp/:dlr_id` | bulk create from a DLP entry |
| GET | `/nmrattendance/api/list/:project_id?from=&to=&contractor_id=` | rows for a project + date range |
| GET | `/nmrattendance/api/details/:id` | single row |
| GET | `/nmrattendance/api/worker/:project_id/:worker_id?from=&to=` | one worker's history |
| GET | `/nmrattendance/api/summary/:project_id?from=&to=&contractor_id=` | aggregate per-contractor / per-worker |
| PUT | `/nmrattendance/api/update/:id` | correct a row |
| PATCH | `/nmrattendance/api/approve/:id` | supervisor verifies (sets verified_by) |

---

## 3. Detailed specs

Endpoint shapes vary slightly per controller method (this module pre-dates the rest of the audit). The full schema is in `src/module/hr/nmrAttendance/nmrattendance.model.js` — usually:

```jsonc
{
  project_id, contractor_id, worker_id,
  date,                          // UTC midnight
  status: "Present"|"Absent"|"Half-Day",
  workType, hoursWorked,
  remarks,
  dlr_id,                        // origin DLP row when seeded
  verified_by,                   // supervisor _id once approved
  verified_at,
  createdBy
}
```

### POST `/nmrattendance/api/create`

```jsonc
{
  "project_id": "<Tender _id>",
  "contractor_id": "<Contractor _id>",
  "worker_id": "<ContractEmployee _id>",
  "date": "2026-04-30",
  "status": "Present",
  "hoursWorked": 8,
  "workType": "Mason",
  "remarks": ""
}

// 201 — { status:true, data:<doc> }
```

### POST `/nmrattendance/api/create-from-dlp/:dlr_id`

Reads a DLP (Daily Labour Plan) entry, expands every worker line into one NMR row marked `Present` by default. Useful for "today's plan = today's attendance" baseline; supervisors then mark exceptions.

```jsonc
// body
{ "verified_by": "<Employee _id>" }   // optional — if the supervisor verifies as part of seeding
```

UI: Site supervisor opens today's DLP → "Mark all present" CTA → bulk-creates rows. Then they edit any absences inline.

### GET `/nmrattendance/api/list/:project_id?from=&to=&contractor_id=`

Per-project list of NMR rows. Filter by date range and (optionally) a single contractor.

UI: Project Site Attendance page → date range picker + contractor filter → table.

### GET `/nmrattendance/api/worker/:project_id/:worker_id?from=&to=`

One worker's attendance history within the project. Used for the worker's individual attendance card.

### GET `/nmrattendance/api/summary/:project_id?from=&to=&contractor_id=`

Aggregates: Present-days / Absent-days / Half-Day-days per worker, totals per contractor. Drives the contractor invoice basis.

### PUT `/nmrattendance/api/update/:id`

Correct a row (e.g. mark Absent → Present after supervisor confirms).

### PATCH `/nmrattendance/api/approve/:id`

```jsonc
{ "verified_by": "<Employee _id>" }   // optional — defaults to req.user._id
```

Sets `verified_by` + `verified_at`. UI shows verified rows in green; unverified in amber so the supervisor can see what's outstanding.

---

## 4. UI design ideas

### Site supervisor — Daily attendance grid

```
┌─ Project: Tower 1 — 30 April 2026 ────────────────────────────┐
│  Contractor: [ All v ]   Date: [ 30-Apr-2026 v ]              │
│                                                                │
│  ┌────────────────────────────────────────────────────────┐   │
│  │ Worker            Skill     Status         Hours       │   │
│  │ Ramu              Mason     ● Present       8          │   │
│  │ Suresh            Helper    ● Present       8          │   │
│  │ Krishnan          Mason     ○ Absent        —          │   │
│  │ Ganesan           Carpenter ◐ Half-Day      4          │   │
│  │ ...                                                     │   │
│  └────────────────────────────────────────────────────────┘   │
│                                                                │
│  [Mark all Present]   [Verify all]                             │
└────────────────────────────────────────────────────────────────┘
```

Each row: tap status pill cycles Present → Half-Day → Absent → Present. Hours field auto-fills based on status.

### Site supervisor — From DLP seeder

When opening today's grid for the first time, if no NMR rows exist yet, show a banner:

```
No attendance recorded yet. Today's DLP has 23 workers.
[Seed from DLP]   (creates rows marked Present, you can edit)
```

Calling `/api/create-from-dlp/:dlr_id` then refreshes the list.

### Project manager — Summary by contractor

```
┌─ Tower 1 · April 2026 ───────────────────────────────────────┐
│  Contractor              Workers  Mandays  Cost basis         │
│  Acme Builders                12     310    PRESENT(310)+...  │
│  Skyline Labour Co            08     236                      │
│  ...                                                          │
│  Total                        45    1240                      │
└──────────────────────────────────────────────────────────────┘
```

Click a contractor → drill into per-worker breakdown. This feeds the contractor weekly-billing flow (`/weeklybilling`, outside HR).

### Worker history card

Mini calendar similar to the Employee monthly view but only Present / Absent / Half-Day pills. Used by the project manager when reviewing a contractor invoice line.

---

## 5. Integration notes / gotchas

- **No leave / payroll** — NMR doesn't deduct leave, doesn't generate payroll docs. The contractor weekly-billing / DLP modules consume the summary aggregates.
- **`worker_id`** points to a `ContractEmployee` (different model from `Employee`). They have their own master at `/contractworker`.
- **DLP seeding is opportunistic** — if no DLP exists for the day, supervisors still create rows manually via `/api/create`.
- **Verification** is binary today (`verified_by` set or null). For multi-step approvals you'd build on top.
- **No mock-GPS / photo verification** at this layer — NMR is supervised-entry, not self-punch. Contractor workers don't have app accounts.
- **Permission gating is light** — only `verifyJWT`. If your deployment needs to restrict NMR edits to site supervisors only, layer a role check in the controller (e.g. `role: "Site Supervisor"`).

---

## 6. Cross-references

- Contractor masters → `/contractor` and `/contractworker` modules (outside this folder).
- DLP — Daily Labour Plan (origin of the seed-from-dlp flow) — see `src/module/site/dlp/`.
- Contractor weekly billing — see `src/module/finance/weeklyBilling/` (consumes NMR summary).
