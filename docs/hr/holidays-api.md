# Holiday Calendar

Base path: `/calendar` — HR-managed list of public, regional, and weekend holidays. Read by every HR module to decide "is today a working day?".

See [README.md](README.md) for shared conventions.

---

## 1. Data model

```jsonc
// One document per UTC-midnight date — date is unique
{
  date,                          // UTC midnight
  name,                          // "Republic Day"
  type: "National" | "Regional" | "Optional" | "Weekend",
  description,                   // "Sunday", "2nd/4th Saturday", or free text
  applicableDepartments: [String]   // empty = applies to everyone; otherwise scoped
}
```

The `applicableDepartments` array, when non-empty, restricts the holiday to those departments. `CalendarService.checkDayStatus(date, employeeDepartment)` honours this filter — employees outside the listed departments still work that day.

---

## 2. Endpoint catalog

### Public reads

| Method | Path | Use |
|---|---|---|
| GET | `/calendar/list?year=2026` | full holiday list for the year |
| GET | `/calendar/listall?year=2026` | thin variant — only `{ _id, date, name }` |

### HR (`hr.attendance.*`)

| Method | Path | Permission |
|---|---|---|
| POST | `/calendar/add` | `create` |
| PUT | `/calendar/update/:id` | `edit` |
| DELETE | `/calendar/delete/:id` | `delete` |
| POST | `/calendar/uploadcsv` | `create` (multipart `file`) |

---

## 3. Detailed specs

### GET `/calendar/list?year=2026`

```jsonc
{ "status": true, "data": [
  { "_id", "date":"2026-01-01T00:00:00Z", "name":"New Year", "type":"National",
    "description":"...", "applicableDepartments":[], ... },
  ...
] }
```

Sorted ascending by date.

UI: feeds the year picker on the Calendar page and the date-picker on the Apply-Leave form. Frontend caches per-year on first load.

### GET `/calendar/listall?year=2026`

Thin projection. Use this for date-picker grey-out logic when you don't need full details.

### POST `/calendar/add`

```jsonc
{
  "date": "2026-08-15",
  "name": "Independence Day",
  "type": "National",
  "description": "Govt holiday"
}
// 201 — emits a "Holiday Added" notification to all employees
// 409 — date already taken
```

UI: HR Calendar admin → "Add holiday" modal. Year-picker, date-picker, name + type radio + optional description.

### PUT `/calendar/update/:id`

Partial update. Same fields as `/add`. `409` if you change the date and another row already exists on that day.

### DELETE `/calendar/delete/:id`

Hard delete (no audit/soft delete on holidays). UI should confirm.

### POST `/calendar/uploadcsv`

```
multipart/form-data
field: file (CSV with columns DATE, NAME, TYPE, DESCRIPTION — case-insensitive)
```

The importer:
1. Inserts/updates one row per CSV line.
2. **Auto-fills** every Sunday and every 2nd/4th Saturday for each year that appears in the CSV with `type=Weekend` rows so the holiday calendar is "complete" without HR having to type 52 Sundays.
3. Reports `{ totalProcessed, successCount, failedCount, errors }`.

UI: HR Calendar admin → "Import CSV". Drag-and-drop area, sample file download link, after-upload result panel showing the counts + any errors with line numbers.

CSV format:

```csv
DATE,NAME,TYPE,DESCRIPTION
2026-01-26,Republic Day,National,
2026-08-15,Independence Day,National,
2026-10-02,Gandhi Jayanti,National,
2026-04-09,Tamil New Year,Regional,Tamil Nadu
```

---

## 4. UI design ideas

### HR Calendar page

```
┌──────────────────────────────────────────────────┐
│  Holidays — 2026             [Year: 2026 v]      │
│  [+ Add holiday] [Import CSV] [Export]           │
├──────────────────────────────────────────────────┤
│  Jan                                             │
│   01  New Year             National              │
│   26  Republic Day         National              │
│  Feb                                             │
│   13  Maha Shivratri       National              │
│   ...                                            │
│  Apr                                             │
│   09  Tamil New Year       Regional   [TN]       │
│  ...                                             │
└──────────────────────────────────────────────────┘
```

- Group by month accordion. Filter pills: National / Regional / Optional / Weekend.
- Row actions: Edit, Delete.
- Department-scoped holidays show a small chip with the department name.
- Toggle to hide weekend (auto-filled) rows so HR sees only the named holidays they entered.

### Year-at-a-glance widget

For dashboards: a 12-row × 31-column grid where each cell is a tiny square colored by holiday type. Tooltip shows the holiday name on hover. Useful for spotting clusters and gaps.

### Apply-Leave form integration

When the user opens the leave form:

1. Fetch `/calendar/list?year=<year of fromDate>` (cache per year).
2. Fetch `/weeklyoff/preview?department=<emp.department>&fromdate=<start>&todate=<end>`.
3. Merge both into a `Set` of "non-working" date strings; pass to the date-picker so those days render greyed out (and don't count toward `totalDays`).

### Quick-add for HR

A keyboard-friendly modal: type the date in `YYYY-MM-DD`, tab to name, tab to type, Enter to save. Sticky "Save & add another" button for sprees.

---

## 5. Integration notes / gotchas

- The CSV importer auto-creates weekly weekend rows (Sunday + 2nd/4th Sat). If the same dates appear in the CSV, the CSV value wins (it overrides "Weekly Off" with whatever name the CSV gave).
- `applicableDepartments` is **opt-in** — empty array = global holiday. To target a department, the array must contain that department's exact `Employee.department` string. Recommend a multi-select dropdown driven by `/department/list` so values stay consistent.
- The Holiday model is **department-scoped via string match**. The Department directory exists separately for HOD lookups; the link between them is the string `name`.
- Holidays don't soft-delete — be careful with the "Delete" confirmation. Deleted holidays disappear from `checkDayStatus` immediately, which may flip future absentee-cron output.
- The `type:"Weekend"` rows seeded by the CSV importer are interchangeable with the runtime decisions made by `WeeklyOffPolicy.evaluate` — backends honour both. Keeping them in the holiday collection is purely so the calendar UI can render them as cells; the per-day decision relies on whichever returns "non-working" first.

---

## 6. Cross-references

- `checkDayStatus(date, department)` is called from punch, leave apply, leave attendance pre-fill, and daily absenteeism cron — see those modules for how each consumes the calendar.
- Per-department weekly-off rules — see [weekly-off-policy.md](weekly-off-policy.md).
- Department directory — see [department.md](department.md).
