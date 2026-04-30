# Geofence Master

Base path: `/geofence` — HR-controlled list of geofenced locations (office buildings, project sites). Referenced by the punch flow when `attendanceType` is `Office` or `Site`.

See [README.md](README.md) for shared conventions.

---

## 1. Data model

```jsonc
{
  name,                      // "Romaa HQ — Anna Salai"
  latitude, longitude,       // center
  radiusMeters,              // 10..5000, default 1000
  isActive,                  // toggle without deleting
  tenderId,                  // optional ref to Tender (project site)
  description,
  createdBy
}
```

The punch flow doesn't actually validate against this collection — it does a Haversine distance check between the device GPS and a `siteLatitude/siteLongitude` passed in the punch payload. The Geofence collection is mostly a master list for the frontend to choose from when picking which site/office to punch against.

---

## 2. Endpoint catalog

All routes require `hr.geofence.*`.

| Method | Path | Permission |
|---|---|---|
| POST | `/geofence/create` | `create` |
| GET | `/geofence/list?isActive=&tenderId=&search=&page=&limit=&fromdate=&todate=` | `read` |
| GET | `/geofence/getbyId/:id` | `read` |
| PUT | `/geofence/update/:id` | `edit` |
| DELETE | `/geofence/delete/:id` | `delete` |
| PATCH | `/geofence/toggle/:id` | `edit` (flips `isActive`) |

---

## 3. Detailed specs

### POST `/geofence/create`

```jsonc
{
  "name": "Project Site — Tower 1",
  "latitude": 13.0827,
  "longitude": 80.2707,
  "radiusMeters": 750,
  "tenderId": "<Tender _id>",
  "description": "Block A entrance"
}

// 201 — { status:true, message:..., data:<doc> }
```

### GET `/geofence/list`

Paginated when `page` or `limit` is sent; returns the full list otherwise. The `tenderId` populate carries `tender_id` (business key), `tender_project_name`, `site_location` for direct display.

```jsonc
{ "data": [
  { "_id", "name", "latitude", "longitude", "radiusMeters", "isActive":true,
    "tenderId": { "_id", "tender_id":"TND-001", "tender_project_name":"Tower 1", "site_location":"..." },
    "description" },
  ...
] }
```

UI: HR Admin Geofence page — list with map preview thumbnail per row.

### PUT `/geofence/update/:id`

Partial update. Only these fields are accepted:
`name, latitude, longitude, radiusMeters, isActive, tenderId, description`.

### PATCH `/geofence/toggle/:id`

No body. Flips `isActive`. Useful for "temporarily disable this site" UX without losing the row.

### DELETE `/geofence/delete/:id`

Hard delete. Confirmation required. After delete, attendance records pointing to this geofence still hold the embedded data — they're unaffected.

---

## 4. UI design ideas

### HR Admin — Geofence master

```
┌─ Geofences ──────────────────────────────────────────────────┐
│  [+ Add geofence]    [Search ...]    [Filter: Active v]      │
├───────────────────────────────────────────────────────────────┤
│ Name             Tender         Lat / Lng         Radius  ●  │
│ Romaa HQ         —              13.0827, 80.2707  500m    ●  │
│ Tower 1          TND-001        13.0820, 80.2720  750m    ●  │
│ Tower 2          TND-002        13.0855, 80.2901  1000m   ○  │
└───────────────────────────────────────────────────────────────┘
```

Each row's tap → split view: form on the left, live map on the right with a draggable pin + radius circle.

### Add / Edit modal — map editor

```
┌─ Edit geofence ──────────────────────────────────────────┐
│  Name *      [ Tower 1                ]                   │
│  Tender      [ TND-001 — Tower 1   v  ]                   │
│  Description [ Block A entrance       ]                   │
│  Lat / Lng:  [ 13.0820 ] [ 80.2720 ]                      │
│  Radius (m): [ 750 ]      slider 10 ────●──── 5000        │
│                                                            │
│  ╔═══════════════════════════════════════════════════════╗│
│  ║                                                       ║│
│  ║          [   live map with pin + radius   ]           ║│
│  ║                                                       ║│
│  ╚═══════════════════════════════════════════════════════╝│
│                                                            │
│  Active [✔]                                                │
│                          [Cancel]    [Save]                │
└────────────────────────────────────────────────────────────┘
```

### Punch flow integration

When the employee opens the punch screen (mobile):

1. Fetch `/geofence/list?isActive=true` (cache for 1 hr).
2. If `attendanceType` is `Office`, default to the closest active geofence.
3. If `attendanceType` is `Site`, filter by `tenderId` matching `assignedProject` from the Employee record.
4. Pass that geofence's `latitude/longitude` as `siteLatitude/siteLongitude` to `/attendance/punch`.

The backend then computes Haversine and rejects if > 1000 m.

---

## 5. Integration notes / gotchas

- **Radius validation**: backend constrains `radiusMeters` to `[10, 5000]`. Frontend should mirror this on the slider.
- **Punch distance threshold is hardcoded at 1000 m** in `userAttendance.service.js` regardless of `radiusMeters`. The geofence record's radius is informational for the UI (drawing the circle); the actual punch tolerance is the constant. If your sites need looser/tighter tolerance, that's currently a backend code change.
- **`tenderId` populate** — only relevant for site geofences. Office geofences leave it null.
- **No history on toggle** — `PATCH /toggle/:id` doesn't write a history row. The audit plugin records the change at the document level.

---

## 6. Cross-references

- Punch payload uses `geofenceId` (Office) or `geofenceSiteId` (Site) — see [attendance-api.md](attendance-api.md).
- Tender / project association → outside HR; see `src/module/tender/tender/tender.model.js`.
