# Leave Request

Base path: `/leave` — the largest HR workflow. Covers application, three-stage approval (Manager → HOD → HR), withdrawal, post-approval cancel, balance refund, life-event grants, balance ledger, attachment uploads, and aggregated approval queues for managers / HODs / HR.

See [README.md](README.md) for shared conventions and [leave-policy.md](leave-policy.md) for the per-department rule engine that drives entitlements, blackout windows, and approval routing.

---

## 1. Data model

```jsonc
// LeaveRequest
{
  employeeId,
  leaveType: "CL"|"SL"|"PL"|"LWP"|"CompOff"|"Maternity"|"Paternity"|"Bereavement"|"Permission",
  requestType: "Full Day"|"First Half"|"Second Half"|"Short Leave",
  fromDate, toDate,                 // UTC midnight
  shortLeaveTime: { from:"10:00", to:"13:00" },   // for Short Leave
  totalDays,                        // 0 for permissions, 0.5/1 for halves/full
  nonWorkingDays: [{date, reason}], // computed at apply-time

  reason, attachmentUrl,
  coveringEmployeeId,

  status: "Pending" | "Processing" | "Manager Approved" | "HOD Approved"
        | "HR Approved" | "Rejected" | "Cancelled" | "Revoked",

  workflowLogs: [
    { action:"Applied"|"Approved"|"Rejected"|"Cancelled"|"Escalated"|"Reminded",
      actionBy, actionDate, remarks,
      role:"Employee"|"Manager"|"HOD"|"HR"|"System"|"Approval Engine"|"Regularization" }
  ],
  finalApprovedBy, finalApprovalDate, rejectionReason,
  isCancelled, cancellationReason, cancelledAt
}

// Sibling: LeaveBalanceHistory — one row per balance mutation
{
  employeeId, leaveType,
  changeType: "Debit"|"Credit"|"Reset"|"CarryForward"|"Expiry"|"ManualAdjust"
            | "Accrual"|"ProRata"|"Encashed"|"EventGrant",
  amount, balanceBefore, balanceAfter, reason,
  leaveRequestId, performedBy
}
```

---

## 2. Endpoint catalog

### Employee

| Method | Path | Use |
|---|---|---|
| POST | `/leave/apply` | submit a request |
| GET | `/leave/my-history?status=&userId=` | view own history (HR can pass `?userId=` for any employee) |
| POST | `/leave/cancel` | cancel after approval (refunds balance) |
| POST | `/leave/withdraw` | withdraw while still Pending (no balance impact) |
| POST | `/leave/attachment` | (multipart) upload medical cert / proof, returns S3 URL |
| GET | `/leave/balance-history?employeeId=&leaveType=&changeType=&page=&limit=` | ledger of balance mutations |
| GET | `/leave/yearly-summary?year=&employeeId=` | aggregate per-leave-type balance changes for a year |

### Approver (manager / HOD / HR)

| Method | Path | Use |
|---|---|---|
| GET | `/leave/team-pending?managerId=` | manager's Pending team queue (delegation-aware) |
| POST | `/leave/action` | approve or reject one request |
| POST | `/leave/action-bulk` | approve or reject N requests in one call |
| GET | `/leave/my-pending-approvals` | unified queue: asManager + asHOD + asHR buckets |

### HR

| Method | Path | Permission |
|---|---|---|
| GET | `/leave/all-pending?status=&fromDate=&toDate=&page=&limit=&search=` | `hr.leave.read` |
| GET | `/leave/history?scope=team\|all&status=&fromdate=&todate=&leaveType=&page=&limit=&search=` | scope=all gated by `hr.leave.read`; non-HR is forced to scope=team |
| POST | `/leave/grant` | `hr.leave.create` — record life event + grant balance |

---

## 3. Apply flow

### POST `/leave/apply`

```jsonc
// Request body — employeeId comes from JWT, never send it
{
  "leaveType": "CL",
  "requestType": "Full Day",
  "fromDate": "2026-05-12",
  "toDate":   "2026-05-14",
  "reason": "Family wedding",
  "shortLeaveTime": { "from":"10:00", "to":"13:00" },   // Short Leave only
  "coveringEmployeeId": "<Employee _id>",                // optional — handover
  "attachmentUrl": "https://..."                         // optional — medical cert
}

// 201
{ "status": true, "message": "Leave applied successfully", "data": {/* LeaveRequest */} }
```

The request runs through these checks (in order):

1. **Global pending lock** — only one Pending request per employee at a time.
2. **Approved overlap** — date range must not overlap a `Manager Approved` / `HOD Approved` / `HR Approved` request. Same-day Short Leaves on the same date conflict; a Short Leave overlapping a Full Day is blocked.
3. **Probation eligibility** — rejected if `LeavePolicyRule.probationEligible === false` and employee is on Probation.
4. **Notice period** — `rule.minNoticeDays` (PL default 7 in fallback) days advance.
5. **Max consecutive days** — rejected if request span > `rule.maxConsecutiveDays`.
6. **Blackout window** — rejected if any policy blackout overlaps.
7. **Permission monthly cap** — Short Leaves count against `rule.monthlyCap` (default 3).
8. **Day calculation** — non-working days from holiday calendar + WeeklyOffPolicy are excluded from `totalDays`.
9. **Balance check** — `Employee.leaveBalance[leaveType] >= totalDays` for balance-tracked types.
10. **Auto-approve** — if `rule.autoApproveUnderDays > 0` and span ≤ that, the request is **immediately HR Approved**, balance debited, attendance pre-filled.

If auto-approve doesn't fire, status is `Pending` and the manager is notified (delegation-aware).

UI:
- Multi-step form: Type → Dates → Reason → Review.
- **Step 1 (Type)**: dropdown for `leaveType`; the form fetches `/leavepolicy/preview` for the current user and shows entitlement, balance, and notes per type.
- **Step 2 (Dates)**: date picker with non-working days greyed out (calendar + weekly-off-policy preview). Below: "This will deduct N days from your CL balance (currently 8)."
- **Step 3 (Reason)**: text area. Conditional file picker for medical cert when SL > `rule.docsRequiredAfterDays`.
- **Step 4 (Review)**: summary card. Show the approver chain: "Manager: Priya → HOD: Suresh (only if > 5 days) → HR".
- Inline error messages for the 10 server checks. The 409 messages from the backend are user-facing — display them verbatim.

### Auto-approve UX

When the policy short-circuits to HR Approved:
- Toast: "Leave auto-approved per policy."
- The list flips immediately (no Pending state ever shown).

---

## 4. Approval workflow

### State machine

```
   Pending
     │  POST /leave/action  role:"Manager"
     │  (debits balance, fills attendance — once)
     ▼
   Manager Approved
     │
     │  needsHOD? — based on rule.requiresHODApproval AND rule.hodMinDays
     │  AND Department.headId is set
     │
     ├── yes ──► HOD Approved ──► HR Approved ────► (final)
     │                role:"HR"
     └── no  ──► HR Approved ──► (final)
                  role:"HR"

   From any non-terminal:
     POST /leave/withdraw  (only while Pending) → Cancelled, no refund
     POST /leave/cancel    (after approval)     → Cancelled, balance refunded, attendance cleared
     POST /leave/action    action:"Reject"      → Rejected, balance refunded if previously debited
```

`Processing` is a transient claim used internally to prevent the legacy `/leave/action` and the approval-engine listener from finalizing the same request twice. The frontend rarely sees it; if it does (race), retry.

### POST `/leave/action`

```jsonc
{
  "leaveRequestId": "<id>",
  "role": "Manager" | "HOD" | "HR",
  "action": "Approve" | "Reject",
  "remarks": "..."           // required for Reject
}

// 200 — { status, message, data: <LeaveRequest with new status> }
// 400 — wrong role for the current state ("HOD approval required first")
// 409 — request already in a terminal state ("Cannot approve: request is already HR Approved")
```

Role-specific checks the backend enforces:
- **Manager** can only approve `Pending`.
- **HOD** can only approve `Manager Approved`, and only when policy + department say HOD is required.
- **HR** can approve `Manager Approved` (if HOD not required) OR `HOD Approved` (always).

If the policy requires HOD but the department has no `headId`, the system **silently skips** HOD — manager's approval routes directly to HR-pending, with a warning logged server-side.

### Side effects of approval

- **Manager approval**: debits balance (numeric or CompOff array), pre-fills `On Leave` attendance rows for the working days in the window.
- **HOD approval**: routes only — no balance change.
- **HR approval (or terminal)**: sets `finalApprovedBy` + `finalApprovalDate`.

### Side effects of rejection

If the leave was past the Manager stage (`Manager Approved` or `HOD Approved`):
- Balance is refunded (numeric increment, or `isUsed: false` flips for CompOff).
- Pre-filled `On Leave` attendance rows (without an actual punch) are deleted.
- A `LeaveBalanceHistory.changeType: Credit` row is written.

This was a pre-existing bug fixed in the H4 rebuild — earlier rejections silently kept the balance debited.

### POST `/leave/action-bulk`

```jsonc
{
  "leaveRequestIds": [ "<id1>", "<id2>", ... ],
  "role": "Manager",
  "action": "Approve",
  "remarks": "Looks good"
}

// 200
{ "status": true,
  "message": "Bulk action complete: 4 processed, 1 failed",
  "data": { "processed": [ "<id1>", ... ], "failed": [ { "id":"<id3>", "message":"..." } ] } }
```

UI: manager queue with checkboxes. After Bulk Approve, show the failed list inline so the user can drill into each.

### GET `/leave/my-pending-approvals`

The unified inbox. Returns three buckets so the frontend renders three tabs:

```jsonc
{
  "status": true,
  "data": {
    "asManager": [/* Pending leaves where caller is direct manager OR active delegate */],
    "asHOD":     [/* Manager Approved leaves where caller is the headId of the employee's Department AND policy requires HOD */],
    "asHR":      [/* Manager Approved + HOD Approved company-wide; only populated if caller has hr.leave.edit */],
    "total":     N
  }
}
```

UI:
- Top-of-page tab strip: `Manager (4)` `HOD (2)` `HR (12)` — counts visible.
- Each tab is the same row component:

```
┌────────────────────────────────────────────────────┐
│ Priya  · CL · 12-14 May (3 days)  · Family wedding  │
│ Submitted 30-Apr 11:02   Stage: Manager Approved    │
│                                  [ Approve ][Reject]│
└────────────────────────────────────────────────────┘
```

- Row tap → side drawer with Applicant card + balance ledger preview + workflow log.
- Sticky bulk-action toolbar at the bottom of the list when multi-selected.

---

## 5. Cancel vs withdraw vs reject

```
                      Pending state?       Refund?    UI button
                      ─────────────────    ──────     ─────────
withdraw  /leave/withdraw   YES (only)     no         "Withdraw"
cancel    /leave/cancel     NO (post-appr) yes        "Cancel leave"
reject    /leave/action     —              yes (if   "Reject" (manager/HOD/HR)
                                               past
                                               Manager
                                               stage)
```

### POST `/leave/withdraw`

```jsonc
{ "leaveRequestId": "<id>" }

// 200 — { status:true, message:"Leave withdrawn." }
// 400 — current status is not Pending
// 403 — caller is not the requester
```

UI: "Withdraw" button visible on a Pending request the user owns. Confirmation modal.

### POST `/leave/cancel`

```jsonc
{ "leaveRequestId": "<id>" }
```

Allowed when status is Manager Approved / HOD Approved / HR Approved (also for Pending, but `withdraw` is preferred). Refunds balance for non-LWP, non-CompOff types. Clears pre-filled `On Leave` attendance rows. Emits `LeaveBalanceHistory.Credit`.

UI: "Cancel leave" button on the user's history row. Confirmation modal with "Balance will be restored" callout.

---

## 6. Life-event grants (HR top-up)

### POST `/leave/grant`

```jsonc
{
  "employeeId": "<Employee _id>",
  "eventType":  "ChildBirth" | "Death" | "Marriage" | "Adoption" | "Other",
  "eventDate":  "2026-04-30",
  "leaveType":  "Maternity" | "Paternity" | "Bereavement",
  "days":       84,             // optional — defaults to rule.annualEntitlement
  "docsUrl":    "https://...",  // optional
  "notes":      "..."
}

// 201 — { status:true, message:"Leave granted",
//          data: { event:<LifeEvent>, balanceAfter:<new balance> } }
// 409 — same (employee, eventType, eventDate) already recorded (idempotent)
// 400 — leaveType not recognised, or grantDays <= 0
```

The endpoint is refill-type-agnostic — works whether the rule is `EVENT_TRIGGERED`, `ANNUAL_RESET` (default for these types), or anything else. It always:
1. Writes a `LifeEvent` row (unique on `{employeeId, eventType, eventDate}`).
2. Increments `Employee.leaveBalance[leaveType]`.
3. Logs `LeaveBalanceHistory.changeType: EventGrant`.
4. Notifies the employee.

UI: HR Employee detail → "Record event & grant" sub-section:

```
┌────────────────────────────────────────────────────┐
│ Record life event                                   │
│ Employee: Priya Krishnan (EMP-042)                  │
│                                                     │
│ Event:    [ ChildBirth   v ]                        │
│ Date:     [ 2026-04-30   ]                          │
│ Doc:      [ upload ] medical-cert.pdf               │
│                                                     │
│ Grant:    [ Maternity   v ]   Days [ 84 ]           │
│ Notes:    [ ... ]                                   │
│                                                     │
│              [ Cancel ]  [ Grant leave ]            │
└────────────────────────────────────────────────────┘
```

After save, the employee gets a notification, the balance jumps, and the LeaveBalanceHistory row is queryable from the ledger.

---

## 7. Balance ledger

### GET `/leave/balance-history?employeeId=&leaveType=&changeType=&page=&limit=`

Paginated chronological ledger.

```jsonc
{ "data": {
    "records": [
      { "leaveType":"PL", "changeType":"Accrual", "amount":2,
        "balanceBefore":4, "balanceAfter":6,
        "reason":"Monthly accrual 2026-05 ...",
        "leaveRequestId": null, "performedBy": null,
        "createdAt":"2026-05-01T00:05:01Z" },
      ...
    ],
    "pagination": { "total":47, "page":1, "limit":30, "pages":2 }
  }
}
```

UI: timeline component — vertical list with `+amount` (green) for credits and `-amount` (red) for debits. Filter pills for `changeType`. Click a row tied to a `leaveRequestId` to drill into the leave.

### GET `/leave/yearly-summary?year=2026&employeeId=`

Per-leave-type aggregate of all changeTypes for the year. Useful for the year-end "review your leave" employee-facing card.

---

## 8. UI design ideas

### Employee — "My leave" page

Three sections stacked:

1. **Balance tiles** — one tile per leave type with `current / annual entitlement` (e.g. `CL 8 / 12`). Tile colors: green (>50%), amber (20–50%), red (<20%). Tap → goes to `balance-history` filtered to that type.
2. **Request history** — list with status pill, dates, totalDays, action menu (Withdraw / Cancel / View).
3. **Apply leave** — sticky bottom-right floating button.

### Employee — Apply leave wizard

Already covered in §3 above.

### Manager — Approval inbox

Single page with three tabs (Manager / HOD / HR). Each tab uses `my-pending-approvals` and renders the matching bucket.

```
┌─ Approvals (18) ──────────────────────────────────────────────┐
│  Manager (4)    HOD (2)    HR (12)                             │
├────────────────────────────────────────────────────────────────┤
│ [ ] Priya Krishnan · CL · 12-14 May (3d) · Family wedding ...  │
│       [Approve] [Reject]                                       │
│ [ ] Suresh ...                                                 │
│ ...                                                            │
├────────────────────────────────────────────────────────────────┤
│  Selected: 2    [Approve all]  [Reject all]                    │
└────────────────────────────────────────────────────────────────┘
```

When the user is Manager **and** HOD of a department **and** has HR permission, they see all three tabs at once. Most users only see the buckets relevant to their role.

### Manager — Drilldown drawer

Right-side drawer when a row is opened:

```
┌── Priya Krishnan · CL · 12-14 May (3d) ───┐
│ Photo · EMP-042 · Site Engineer · Engg.    │
│                                            │
│ Reason: Family wedding                     │
│ Covering: Suresh (Site Engineer)           │
│ Attachment: medical-cert.pdf  [view]       │
│                                            │
│ Balance                                    │
│   CL 8 / 12      SL 12 / 12     PL 18      │
│                                            │
│ Approver chain                             │
│   Manager: Priya's manager (Anand)         │
│   HOD: not required                        │
│   HR: any HR with hr.leave.edit            │
│                                            │
│ Workflow log                               │
│   30-Apr 11:02  Applied   (Employee)       │
│   30-Apr 11:04  Reminded  (System)         │
│                                            │
│  [ Reject ]              [ Approve ]       │
└────────────────────────────────────────────┘
```

### HR — All-pending screen

Wide table view with status / type / dates / employee filters. Linked to the same drawer.

### HR — History (audit-style)

Use `/leave/history` with `scope=all`. Columns: Employee, Type, Range, totalDays, Status, Approved by, Approval date, Notes.

### HR — Life event recorder

See §6 above — minimal modal launched from Employee detail.

---

## 9. Notifications fired (relevant to UI)

| Trigger | Audience | Where to surface |
|---|---|---|
| Apply | active manager (delegation-aware) | manager bell |
| Manager approves → HOD pending | HOD (when configured) | HOD bell |
| Manager / HOD approves → HR pending | HR roles (`hr.leave.edit`) | HR bell |
| Final approve | applicant | employee bell |
| Reject | applicant | employee bell |
| Cancel / Withdraw | (no notification — silent) | — |
| Reminder cron (>12 hr Pending) | current approver | approver bell |
| SLA escalation cron | HR roles | HR bell |
| Holiday added | every employee | shared announcement banner |
| Comp-off credited | applicant | employee bell |
| Life-event grant | applicant | employee bell |

---

## 10. Integration notes / gotchas

- **Auto-approve** bypasses `Pending` entirely and finalizes during `/leave/apply`. The response status is `HR Approved` directly. Don't show "your request is pending" to the user in this case.
- **Three-stage flow is opt-in per department**. Without a `LeavePolicy.requiresHODApproval=true` rule and a `Department.headId` set, every leave still flows Pending → Manager Approved → HR Approved (legacy two-step).
- **Refund-on-reject** triggers when `prevStatus` was `Manager Approved` or `HOD Approved`. From `Pending` (Manager rejecting before approving) there's nothing to refund.
- **CompOff** uses an array of credits (`Employee.leaveBalance.compOff[]`). Approval picks unused credits FIFO by expiry, marks `isUsed: true`. Rejection reverses the most-recently-used credits. Year-end cron expires un-used credits past `expiryDate`.
- **Permission** counts against `rule.monthlyCap` (default 3) — frontend should query the policy to display the current month's remaining count.
- **`scope=all`** on `/leave/history` requires `hr.leave.read`. Without that, the backend silently demotes scope to `team` with `managerId = req.user._id`. Don't surprise the user — show a hint when this happens.
- **Workflow logs** include `Reminded` and `Escalated` rows from the SLA crons — render with distinct icons in the timeline.
- **`leaveRequestId`** is a Mongo ObjectId. Frontend should treat it as opaque.
- **Withdraw vs Cancel** is split deliberately. UI shouldn't expose both buttons at the same time — show "Withdraw" while Pending, "Cancel" once approved.

---

## 11. Cross-references

- Per-department refill rules → [leave-policy.md](leave-policy.md)
- Working-day classification → [holidays-api.md](holidays-api.md), [weekly-off-policy.md](weekly-off-policy.md)
- HOD resolution → [department.md](department.md)
- Comp-off lifecycle (earn → consume → expire) → [attendance-api.md](attendance-api.md) §Holiday Work, [employee-api.md](employee-api.md) §`/me/compoff-balance`, this doc §CompOff
- Pre-filled `On Leave` attendance rows → [attendance-api.md](attendance-api.md) §status enum
