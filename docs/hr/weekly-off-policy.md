# Weekly-Off Policy

Base path: `/weeklyoff` — HR-controlled per-department weekly-off rules. Decides whether Saturday is full-off, 2nd/4th-only, alternate-week, or any other DOW pattern. Honoured by punch, daily-absenteeism cron, leave application, leave attendance pre-fill.

See [README.md](README.md) for shared conventions.

---

## 1. Resolution chain

```
1. Active row where { department: <employee.department>, isActive: true }
2. Active row where { department: "DEFAULT",            isActive: true }
3. null  → hardcoded fallback (Sun off + 2nd/4th Sat off — preserves
           legacy behaviour until HR seeds a policy)
```

The `department` field on the policy is matched as a string against `Employee.department`. Use `"DEFAULT"` as a sentinel for the company-wide row.

---

## 2. Schema

```jsonc
{
  department,    // "DEFAULT" or department name
  weeklyOffs: [
    {
      dow: 0..6,            // 0=Sun, 1=Mon, ... 6=Sat
      weeks: [1..5],        // optional — which week-of-month indices apply (empty = all)
      label: "Sunday"       // optional display label; auto-generated if missing
    }
  ],
  isActive,
  notes
}
```

### Examples

| Pattern | weeklyOffs |
|---|---|
| Sun only | `[{dow:0}]` |
| Sun + every Sat (5-day week) | `[{dow:0}, {dow:6}]` |
| Sun + 2nd & 4th Sat (default 6-day) | `[{dow:0}, {dow:6, weeks:[2,4]}]` |
| Sun + alternate Sat (1st, 3rd, 5th) | `[{dow:0}, {dow:6, weeks:[1,3,5]}]` |
| Fri + Sun (Middle East schedule) | `[{dow:5}, {dow:0}]` |

---

## 3. Endpoint catalog

| Method | Path | Permission |
|---|---|---|
| POST | `/weeklyoff/upsert` | `hr.attendance.edit` |
| GET | `/weeklyoff/list?isActive=&search=&page=&limit=` | `hr.attendance.read` |
| GET | `/weeklyoff/preview?department=&fromdate=&todate=` | `hr.attendance.read` |
| GET | `/weeklyoff/:department` | `hr.attendance.read` |
| DELETE | `/weeklyoff/:department` | `hr.attendance.delete` |

---

## 4. Detailed specs

### POST `/weeklyoff/upsert`

Idempotent upsert keyed on `department`.

```jsonc
{
  "department": "Engineering",
  "weeklyOffs": [
    { "dow": 0, "label": "Sunday" },
    { "dow": 6, "label": "Every Saturday" }
  ],
  "isActive": true,
  "notes": "5-day work week — implemented Q2 2026"
}

// 200 — { status:true, message:"Weekly-off policy saved", data:<doc> }
```

### GET `/weeklyoff/preview?department=Engineering&fromdate=2026-05-01&todate=2026-05-31`

Returns the dates the policy declares off in the given window.

```jsonc
{
  "status": true,
  "data": {
    "resolvedFrom": "Engineering",   // or "DEFAULT" / "FALLBACK"
    "weeklyOffs": [
      { "date":"2026-05-02", "reason":"Every Saturday" },
      { "date":"2026-05-03", "reason":"Sunday" },
      { "date":"2026-05-09", "reason":"Every Saturday" },
      { "date":"2026-05-10", "reason":"Sunday" },
      ...
    ]
  }
}
```

This endpoint is the **single source of truth** for the apply-leave date-picker grey-out logic.

### GET `/weeklyoff/list`

Paginated list of all rows. Used by the HR admin policy-editor index page.

### GET `/weeklyoff/:department`

Single row lookup. Used to pre-populate the policy editor form.

### DELETE `/weeklyoff/:department`

Removes the row. Departments without their own row fall back to DEFAULT then to the hardcoded behaviour.

---

## 5. UI design ideas

### HR Admin — Weekly-Off Policy editor

```
┌─ Weekly-Off Policy ────────────────────────────────────────────┐
│  Departments: [DEFAULT] [Engineering] [Site Operations] [+]    │
├─────────────────────────────────────────────────────────────────┤
│  Engineering            Active: ●                               │
│                                                                 │
│  Choose weekly off days                                         │
│  Day        Off       Specific weeks of month                   │
│  Mon        ☐          —                                         │
│  Tue        ☐          —                                         │
│  Wed        ☐          —                                         │
│  Thu        ☐          —                                         │
│  Fri        ☐          —                                         │
│  Sat        ☑          [✔All] 1st 2nd 3rd 4th 5th               │
│  Sun        ☑          [✔All] 1st 2nd 3rd 4th 5th               │
│                                                                 │
│  Preview month: [ May 2026  v ]                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Mon Tue Wed Thu Fri Sat Sun                              │   │
│  │              1   2   3                                    │   │
│  │   4   5   6   7   8   9  10                               │   │
│  │  11  12  13  14  15  16  17                               │   │
│  │  18  19  20  21  22  23  24                               │   │
│  │  25  26  27  28  29  30  31                               │   │
│  │   (greyed cells = off per current selection)              │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
│  Notes: [ ... ]                                                 │
│                          [Cancel]    [Save policy]              │
└─────────────────────────────────────────────────────────────────┘
```

The preview cells are driven by `/weeklyoff/preview` against the in-progress edit (POST a temporary preview if you want zero-save preview, or accept that "preview" means "what the saved policy would do"). For the simplest implementation, save a draft → call preview → display.

### Workflow guidance to HR

Below the editor add a small info card:

> **Tip — Set DEFAULT first.** Departments without their own row inherit DEFAULT. If both DEFAULT and a per-department row exist, the per-department row wins.
>
> **HOD-aware.** This policy is consumed by leave application, daily attendance, and absenteeism cron — they all respect the calling employee's department.

### Apply-Leave date-picker integration

When opening the date picker on the leave form:

```js
const off = await fetch(`/weeklyoff/preview?department=${user.department}&fromdate=${rangeStart}&todate=${rangeEnd}`);
const dateSet = new Set(off.data.weeklyOffs.map(d => d.date));
// + named holidays from /calendar/list
// → pass to <DatePicker disabledDates={dateSet}>
```

Show an info pill below the picker: "Weekends excluded automatically — totalDays = working days only."

---

## 6. Integration notes / gotchas

- **`weeks` is 1..5** representing the week-of-month index. Empty array means "every week of every month".
- **Day-of-week is JavaScript convention** (`new Date().getDay()` — 0=Sunday, 6=Saturday).
- **DEFAULT vs no-DEFAULT** — if neither a department row nor a DEFAULT row exists, the hardcoded fallback (Sunday + 2nd/4th Saturday off) applies. Recommend seeding a DEFAULT row at go-live so the behaviour is explicit.
- **`/weeklyoff/preview`** is read-only and does NOT require a saved policy — it resolves on the fly so an editor's draft state can be previewed by saving once and previewing immediately.
- **Multiple rules same DOW** — if two rules in `weeklyOffs[]` both target Saturday with overlapping `weeks`, the first match wins; downstream callers don't care, the date is just "off". HR shouldn't intentionally duplicate; just merge into one rule.
- **No effective-dating** — unlike LeavePolicy, WeeklyOffPolicy is current-state-only. To roll out a 5-day-week change starting next month, you change the row at month-end. Past attendance data is unaffected (it's based on the policy at the time the day was processed, baked into the attendance doc's `shiftConfig`).

---

## 7. Cross-references

- Day classification fans out from here through `CalendarService.checkDayStatus(date, department)` — see [holidays-api.md](holidays-api.md).
- Leave totalDays calculation uses the batched range variant — see [leave-api.md](leave-api.md) §Apply step 8.
- Department directory (just the headId connection — `Employee.department` is still a string match) → [department.md](department.md).
