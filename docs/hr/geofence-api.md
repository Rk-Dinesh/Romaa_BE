# Geofence API

Base path: `/geofence`

All routes require JWT. Permissions fall under `hr.geofence.*`.

A geofence defines a circular zone (lat/lng + radius). When an employee punches in via the mobile app, their GPS coordinates are compared against the active geofence for their site. If distance > `radiusMeters`, the punch is rejected.

---

## Endpoints

### POST `/geofence/create`
Create a new geofence zone. Permission: `hr.geofence.create`

**Request body:**
```json
{
  "name": "Site A Office",
  "latitude": 19.0760,
  "longitude": 72.8777,
  "radiusMeters": 200,
  "tenderId": "<optionalTenderId>",
  "description": "Main gate area"
}
```

**Response `201`:**
```json
{
  "status": true,
  "message": "Geofence created successfully",
  "data": {
    "_id": "...",
    "name": "Site A Office",
    "latitude": 19.076,
    "longitude": 72.8777,
    "radiusMeters": 200,
    "isActive": true,
    "tenderId": { "_id": "...", "tender_project_name": "Bridge Project" }
  }
}
```

---

### GET `/geofence/list`
List all geofences. Permission: `hr.geofence.read`

**Query params:**
- `?isActive=true` — filter active-only
- `?tenderId=<id>` — filter by site/project

---

### GET `/geofence/getbyId/:id`
Fetch a single geofence. Permission: `hr.geofence.read`

---

### PUT `/geofence/update/:id`
Update any field. Permission: `hr.geofence.edit`

```json
{ "radiusMeters": 300, "name": "Renamed Site" }
```

---

### DELETE `/geofence/delete/:id`
Permanently delete. Permission: `hr.geofence.delete`

---

### PATCH `/geofence/toggle/:id`
Toggle `isActive` between `true` / `false`. Permission: `hr.geofence.edit`

**Response:**
```json
{ "status": true, "message": "Geofence deactivated", "data": { "isActive": false } }
```

---

## How it connects to Attendance Punch

When calling `POST /attendance/punch`, pass these fields so the server validates distance:

```json
{
  "employeeId": "<id>",
  "punchType": "In",
  "latitude": 19.0762,
  "longitude": 72.8779,
  "siteLatitude": 19.0760,
  "siteLongitude": 72.8777,
  "attendanceType": "Site",
  "geofenceSiteId": "<tenderId>",
  "geofenceId": "<geofenceId>"
}
```

The server calculates Haversine distance. If > 1000m it rejects with 403.

---

## Field Reference

| Field | Type | Constraint |
|---|---|---|
| `name` | String | required |
| `latitude` | Number | required |
| `longitude` | Number | required |
| `radiusMeters` | Number | required, min:10, max:5000 |
| `isActive` | Boolean | default: true |
| `tenderId` | ObjectId → Tenders | optional |
