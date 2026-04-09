# Holiday Calendar API

Base path: `/calendar`

Read endpoints are public. Write endpoints require JWT + `hr.holidays.*` permission.

---

## Endpoints

### GET `/calendar/list`
All holidays for a year (full objects).

**Query:** `?year=2026` (defaults to current year)

**Response:**
```json
{
  "status": true,
  "data": [
    { "_id": "...", "date": "2026-01-26T00:00:00.000Z", "name": "Republic Day", "type": "National" },
    { "_id": "...", "date": "2026-01-01T00:00:00.000Z", "name": "New Year", "type": "National" }
  ]
}
```

---

### GET `/calendar/listall`
Slim list (id + date + name only) — use for dropdowns / calendar widgets.

**Query:** `?year=2026`

---

### POST `/calendar/add`
Add a single holiday. Permission: `hr.holidays.create`

**Request body:**
```json
{
  "date": "2026-08-15",
  "name": "Independence Day",
  "type": "National",
  "description": "National public holiday"
}
```

`type` enum: `National` | `Regional` | `Optional` | `Weekend`

**Response `201`:**
```json
{ "status": true, "message": "Holiday added to calendar successfully", "data": { ... } }
```

---

### PUT `/calendar/update/:id`
Update an existing holiday. Permission: `hr.holidays.edit`

**Request body** (any subset of fields):
```json
{ "name": "Corrected Name", "type": "Regional" }
```

---

### DELETE `/calendar/delete/:id`
Remove a holiday. Permission: `hr.holidays.delete`

---

### POST `/calendar/uploadcsv`
Bulk-import holidays from a CSV or XLSX file. Permission: `hr.holidays.create`

**Form-data:** `file` — `.csv` or `.xlsx`

**CSV format:**
```
DATE,NAME,TYPE,DESCRIPTION
2026-01-26,Republic Day,National,
2026-08-15,Independence Day,National,
```

- Dates matching Sunday or 2nd/4th Saturday are automatically overridden as `Weekly Off / Weekend`.
- All missing Sundays and 2nd/4th Saturdays for the detected year(s) are auto-filled.

**Response:**
```json
{
  "status": true,
  "data": {
    "totalProcessed": 312,
    "successCount": 312,
    "failedCount": 0,
    "errors": []
  }
}
```

---

## Working Day Logic

The system treats the following as **non-working days**:
1. **Sunday** — always off
2. **2nd and 4th Saturday** — off (standard construction industry rule)
3. **Any date in the Holiday collection** — named holiday

This logic is used by:
- Leave application (to skip non-working days in totalDays calculation)
- Attendance punch-in (to detect Holiday Work and award Comp-Off)
- Daily absenteeism cron (skips non-working days)
