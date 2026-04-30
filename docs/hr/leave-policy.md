# Leave Policy

Base path: `/leavepolicy` — HR-editable rule set that drives every leave decision: entitlement, refill cadence, carry-forward, encashment, blackouts, approval chain (incl. HOD requirement), notice period, max consecutive days, doc-required threshold, auto-approve threshold, escalation SLA.

See [README.md](README.md) for shared conventions and [leave-api.md](leave-api.md) for how the rules are consumed.

---

## 1. Resolution chain

Every consumer (`applyLeave`, `actionLeave`, monthly accrual cron, year-end cron, `getMyPendingApprovals`) calls `LeavePolicyService.resolveForEmployee(employee)`:

```
1. Active row where { scope: <employee.department>, isActive: true,
                      effectiveFrom <= now <= effectiveTo (or null) }
2. Active row where { scope: "DEFAULT", ... }
3. null  → callers fall back to FALLBACK_RULES (legacy hardcoded constants
           in leavePolicy.service.js — preserves pre-policy behaviour)
```

The fallback rules are:

| Type | refillType | annual | accrualPerPeriod | CF cap | encash | probation | proRata | other |
|---|---|---|---|---|---|---|---|---|
| CL | ANNUAL_RESET | 12 | — | 0 | no | not on probation | yes | requires Mgr+HR |
| SL | ANNUAL_RESET | 12 | — | 0 | no | yes | yes | docs after 3 days |
| PL | MONTHLY_ACCRUAL | 24 | 2 / month | 30 | yes | not on probation | yes | min notice 7 days |
| Maternity | ANNUAL_RESET | 84 | — | 0 | no | yes | yes | HR only |
| Paternity | ANNUAL_RESET | 15 | — | 0 | no | yes | yes | Mgr+HR |
| Bereavement | ANNUAL_RESET | 5 | — | 0 | no | yes | yes | Mgr only |
| CompOff | EARNED | — | — | — | no | yes | n/a | validity 60 d |
| Permission | MONTHLY_RESET | — | — | — | no | yes | n/a | monthly cap 3 |
| LWP | MANUAL_ONLY | — | — | — | no | yes | n/a | — |

---

## 2. Schema — the LeavePolicyRule shape

```jsonc
{
  policyName: "Standard 2026",
  scope: "DEFAULT" | "Engineering" | "Site Operations" | ...,   // matches Employee.department
  effectiveFrom, effectiveTo (null = open-ended),
  isActive,
  rules: [
    {
      leaveType: "PL" | "CL" | ...,
      refillType: "ANNUAL_RESET" | "MONTHLY_ACCRUAL" | "QUARTERLY_ACCRUAL"
                | "EVENT_TRIGGERED" | "EARNED" | "MONTHLY_RESET"
                | "TENURE_BASED" | "PRO_RATED_HIRE" | "MANUAL_ONLY",

      annualEntitlement,   // baseline for ANNUAL_RESET / accrual cap / pro-rata math
      accrualPerPeriod,    // MONTHLY_ACCRUAL / QUARTERLY_ACCRUAL credit
      tenureSlabs: [{ minMonths, entitlement }],   // overrides annualEntitlement when present

      carryForwardCap,
      encashable, encashmentBasis: "BASIC"|"GROSS"|"FIXED", encashmentRatePerDay,

      probationEligible, proRataForNewJoiners,
      maxConsecutiveDays, minNoticeDays, docsRequiredAfterDays,
      monthlyCap,           // Permission
      validityDays,         // CompOff

      requiresManagerApproval, requiresHODApproval, hodMinDays,
      requiresHRApproval, autoApproveUnderDays, escalationAfterHours,

      blackoutDates: [{ from, to, reason }]
    },
    ...
  ],
  notes
}
```

When `getRule(policy, leaveType)` is called, the policy rule is merged on top of `FALLBACK_RULES[leaveType]` so unset fields fall through to sane defaults.

---

## 3. Endpoint catalog

| Method | Path | Permission |
|---|---|---|
| POST | `/leavepolicy/upsert` | `hr.leave.edit` |
| GET | `/leavepolicy/list?scope=&isActive=&page=&limit=&search=` | `hr.leave.read` |
| GET | `/leavepolicy/:id` | `hr.leave.read` |
| GET | `/leavepolicy/preview?employeeId=` | JWT only — every employee can preview their resolved policy |
| DELETE | `/leavepolicy/:id` | `hr.leave.delete` |

---

## 4. Detailed specs

### POST `/leavepolicy/upsert`

Idempotent upsert keyed on `scope`. If an active row exists at that scope, this updates it; else it inserts a new active row.

```jsonc
{
  "policyName": "Engineering 2026",
  "scope": "Engineering",
  "effectiveFrom": "2026-01-01",
  "effectiveTo":   null,
  "isActive": true,
  "rules": [
    {
      "leaveType": "PL",
      "refillType": "MONTHLY_ACCRUAL",
      "annualEntitlement": 24,
      "accrualPerPeriod": 2,
      "carryForwardCap": 30,
      "encashable": true,
      "encashmentBasis": "BASIC",
      "probationEligible": false,
      "proRataForNewJoiners": true,
      "minNoticeDays": 7,
      "requiresManagerApproval": true,
      "requiresHODApproval": true,
      "hodMinDays": 5,
      "requiresHRApproval": true,
      "autoApproveUnderDays": 0,
      "escalationAfterHours": 48,
      "blackoutDates": [
        { "from":"2026-03-25", "to":"2026-03-31", "reason":"FY-end close" }
      ]
    },
    { "leaveType":"CL", "refillType":"ANNUAL_RESET", "annualEntitlement":12, "autoApproveUnderDays":1 }
  ]
}
```

### GET `/leavepolicy/preview?employeeId=`

Resolves the active rule set for the calling user (or `?employeeId=` for HR). Response includes every leave type with the *effective* entitlement (after tenure slabs, before pro-rata).

```jsonc
{
  "status": true,
  "data": {
    "scope": "Engineering",
    "policyName": "Engineering 2026",
    "rules": {
      "CL": { "refillType":"ANNUAL_RESET", "annualEntitlement":12, "effectiveEntitlement":12, ... },
      "PL": { "refillType":"MONTHLY_ACCRUAL", "annualEntitlement":24, "tenureSlabs":[...], "effectiveEntitlement":30, ... },
      ...
    }
  }
}
```

UI: feeds the Apply-Leave wizard's Type-step explanatory pane:

```
┌── About Privilege Leave ─────────────────────────┐
│  Annual entitlement: 30 days (5+ year tenure)     │
│  Accrues 2 days / month                           │
│  Carry-forward up to 30 days                      │
│  Encashable beyond cap                            │
│  Min 7 days notice required                       │
│  HOD approval required for leaves > 5 days        │
│  Blackout: 25–31 Mar (FY-end close)               │
└───────────────────────────────────────────────────┘
```

---

## 5. UI design ideas

### HR Policy Editor (the most complex screen in this folder)

```
┌─ Leave Policy ─────────────────────────────────────────────────────┐
│  Policies: [Standard 2026] [Engineering 2026] [Site Ops 2026] [+]   │
├─────────────────────────────────────────────────────────────────────┤
│  Engineering 2026                                                   │
│  Scope: Engineering    Active: ●    Effective: 1 Jan 2026 → open    │
│                                                                     │
│  ┌─ Rules ─────────────────────────────────────────────────────────┐│
│  │ CL   12 days  ANNUAL_RESET     auto-approve <1d  Mgr+HR  [edit] ││
│  │ SL   12 days  ANNUAL_RESET     docs after 3d     Mgr+HR  [edit] ││
│  │ PL   24 days  MONTHLY_ACCRUAL  +2/mo  CF=30  encash  Mgr+HOD+HR ││
│  │ ...                                                              ││
│  └──────────────────────────────────────────────────────────────────┘│
│  [+ Add rule]                                                       │
│                                                                     │
│  Blackout windows                                                   │
│  ┌──────────────────────────────────────────────────────────────────┐│
│  │ 25–31 Mar 2026  FY-end close                              [×]   ││
│  │ 24–28 Dec 2026  Annual maintenance                        [×]   ││
│  └──────────────────────────────────────────────────────────────────┘│
│  [+ Add blackout]                                                   │
│                                                                     │
│  [Save]  [Save as new]  [Discard]                                   │
└─────────────────────────────────────────────────────────────────────┘
```

### Rule editor sub-modal

When the user clicks `[edit]` on a rule:

```
┌─ Edit rule: PL ───────────────────────────────────────────────┐
│  Refill type:  [ MONTHLY_ACCRUAL  v ]                          │
│  Annual entitlement:  [ 24 ]    Accrual / period: [ 2 ]        │
│                                                                │
│  ▾ Tenure slabs                                                │
│     0 mo  →  18 days                                           │
│    24 mo  →  24 days                                           │
│    60 mo  →  30 days                                           │
│    [+ Add slab]                                                │
│                                                                │
│  Carry-forward cap:    [ 30 ]                                  │
│  Encashable:           [✔]   Basis: [ BASIC v ]   Rate: [ — ]  │
│                                                                │
│  ▾ Eligibility                                                 │
│     Probation eligible:        [✗]                             │
│     Pro-rata new joiners:      [✔]                             │
│     Max consecutive days:      [ 30 ]                          │
│     Min notice days:           [ 7 ]                           │
│     Docs required after days:  [ — ]                           │
│                                                                │
│  ▾ Approval matrix                                             │
│     Manager: [✔]   HOD: [✔]  HOD min days: [ 5 ]               │
│     HR: [✔]   Auto-approve under days: [ 0 ]                   │
│     Escalation after hours: [ 48 ]                             │
│                                                                │
│              [Cancel]                       [Save rule]        │
└────────────────────────────────────────────────────────────────┘
```

### Refill type → field visibility

| refillType | annual | accrualPerPeriod | tenureSlabs | CF cap | monthlyCap | validityDays |
|---|---|---|---|---|---|---|
| ANNUAL_RESET | yes | — | yes | yes | — | — |
| MONTHLY_ACCRUAL | yes (cap) | yes | yes | yes | — | — |
| QUARTERLY_ACCRUAL | yes (cap) | yes | yes | yes | — | — |
| EVENT_TRIGGERED | yes (default grant) | — | — | — | — | — |
| EARNED | — | — | — | — | — | yes |
| MONTHLY_RESET | — | — | — | — | yes | — |
| TENURE_BASED | — | — | yes (required) | yes | — | — |
| PRO_RATED_HIRE | yes | — | — | yes | — | — |
| MANUAL_ONLY | — | — | — | — | — | — |

Hide irrelevant fields based on the selected `refillType`.

### Preview-as-employee

A side panel: "Show this policy as if I were [employee selector]". Pulls the resolved rules + employee tenure and renders the same balance card the employee will see.

---

## 6. Common HR setups

### Default 9-to-6 desk job (DEFAULT scope)

```jsonc
{ "policyName":"Standard 2026", "scope":"DEFAULT",
  "rules": [
    { "leaveType":"CL", "annualEntitlement":12, "autoApproveUnderDays":1 },
    { "leaveType":"SL", "annualEntitlement":12, "docsRequiredAfterDays":3 },
    { "leaveType":"PL", "refillType":"MONTHLY_ACCRUAL", "annualEntitlement":24, "accrualPerPeriod":2,
      "carryForwardCap":30, "encashable":true, "minNoticeDays":7 },
    { "leaveType":"Maternity", "annualEntitlement":84 },
    { "leaveType":"Paternity", "annualEntitlement":15 },
    { "leaveType":"Bereavement", "annualEntitlement":5 },
    { "leaveType":"CompOff", "validityDays":60 },
    { "leaveType":"Permission", "monthlyCap":3 } ] }
```

### Site Operations (no Permission, longer notice)

```jsonc
{ "policyName":"Site Ops 2026", "scope":"Site Operations",
  "rules": [
    { "leaveType":"PL", "refillType":"MONTHLY_ACCRUAL", "annualEntitlement":24, "accrualPerPeriod":2,
      "minNoticeDays":14, "requiresHODApproval":true, "hodMinDays":3,
      "blackoutDates":[{ "from":"2026-09-15", "to":"2026-10-31", "reason":"Peak monsoon construction" }] },
    { "leaveType":"Permission", "monthlyCap":1 } ] }
```

### Engineering with tenure slabs

```jsonc
{ "leaveType":"PL", "refillType":"MONTHLY_ACCRUAL",
  "tenureSlabs":[
    { "minMonths":0,  "entitlement":18 },
    { "minMonths":24, "entitlement":24 },
    { "minMonths":60, "entitlement":30 } ],
  "accrualPerPeriod":2, "carryForwardCap":30, "encashable":true }
```

### Auto-approve permissions only

```jsonc
{ "leaveType":"Permission", "monthlyCap":3, "autoApproveUnderDays":1 }
```

The 0.5-day "span" of a Short Leave fits ≤ 1 day, so permissions auto-approve while CL still goes through Manager.

---

## 7. Crons that read the policy

| Cron | Reads | Effect |
|---|---|---|
| Daily absenteeism (23:59) | rule.refillType (only for guards) | mostly unaffected |
| Monthly accrual (00:05 1st) | rule.refillType=MONTHLY_ACCRUAL/QUARTERLY_ACCRUAL, accrualPerPeriod, annualEntitlement (for cap), probationEligible, tenureSlabs | credits balance + writes Accrual history |
| Year-end (23:55 Dec 31) | refillType, annualEntitlement, carryForwardCap, encashable, encashmentBasis, encashmentRatePerDay | resets / carries-forward / emits encashment vouchers |
| Leave SLA escalation (09:00 daily) | escalationAfterHours | escalates Pending leaves to HR |

---

## 8. Integration notes / gotchas

- **`scope` is a string** matching `Employee.department` exactly. Typos won't error — they just silently fall through to DEFAULT then FALLBACK. Recommend driving the scope picker with `/department/list` to keep values consistent.
- **Multiple active rows per scope** — the upsert keeps the most-recently-active one per scope. To phase in a new policy without overlap, set `effectiveFrom/effectiveTo` on the old row before inserting the new one.
- **`requiresHODApproval=true` without a Department record** — the system silently skips HOD (logged warning). Seed `/department/upsert` first if you want HOD enforced.
- **Blackout dates are date ranges** — use UTC-midnight strings. The overlap test is inclusive on both ends.
- **`autoApproveUnderDays`** treats Short Leaves as `0.5 day span`. So `autoApproveUnderDays >= 1` will auto-approve permissions; `>= 0.5` would too.
- **Tenure slabs override `annualEntitlement`** when present. The slab matched is the highest `minMonths <= service`. Empty `tenureSlabs` → fall back to `annualEntitlement`.
- **`encashmentBasis: "FIXED"`** uses `encashmentRatePerDay` directly. BASIC/GROSS divide the relevant salary by 30. There's no FY proration in the encashment calc currently — it's "rate × excessDays".

---

## 9. Cross-references

- Resolution + tenure + getNextStage helpers are all in `leavePolicy.service.js`.
- Leave application flow that consumes the rules → [leave-api.md](leave-api.md) §Apply.
- HOD configuration → [department.md](department.md).
- Year-end encashment ledger → currently surfaced via `LeaveBalanceHistory` (`changeType: "Encashed"`) and the `LeaveEncashment` collection (no UI endpoint yet).
