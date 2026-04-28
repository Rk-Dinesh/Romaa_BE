
# Fuel Telemetry — Frontend Integration Guide

How to surface third-party (Diztek) fuel-sensor data in the Romaa UI.

---

## 1. Backend overview (what you can rely on)

- A backend cron pulls live fuel data every 6 hrs (15 min in dev) for every `MachineryAsset` where:
  - `currentStatus === "Active"`
  - `serialNumber` is set (used as `plate_no`)
  - `gps.deviceId` is set (used as `imei_no`)
- Each call writes a row in the new `FuelTelemetryLog` collection.
- A summary block on `MachineryAsset.fuelTelemetry` is updated after every sync — **the asset detail page can show fuel state without a second API call.**

So you have two reading patterns:
1. **Just show the latest snapshot** → use `MachineryAsset.fuelTelemetry` already returned by your existing asset endpoints.
2. **History / charts / refuel events** → call the new `/fueltelemetry/*` endpoints below.

---

## 2. Auth & base config

Same as the rest of the app:
- Send the JWT as `Authorization: Bearer <accessToken>` **or** rely on the `accessToken` HTTP-only cookie set at login.
- Base URL: whatever your existing API base is (e.g. `import.meta.env.VITE_API_URL`).
- Standard response envelope: `{ status: boolean, data?, message?, count? }`.

### Required permissions
| Action | Permission key |
|---|---|
| Read latest / history | `assets.machinery.read` |
| Manual sync (one or all) | `assets.machinery.edit` |

If your role page has a "Machinery" sub-module, no new keys to add. If a user lacks `edit`, hide the "Refresh now" button.

---

## 3. Endpoints

> All routes are prefixed `/fueltelemetry`.

### 3.1 Latest reading for one asset
```
GET /fueltelemetry/asset/:assetId/latest
```
- `:assetId` is the **MongoDB `_id`** of `MachineryAsset` (NOT the human `assetId` like `EX-01`).
- Returns the most recent `FuelTelemetryLog` doc, or `data: null` if the asset has never been synced.

**Response**
```jsonc
{
  "status": true,
  "data": {
    "_id": "...",
    "assetId": "<MachineryAsset _id>",
    "assetCode": "EX-01",
    "plateNumber": "TN87F8808",
    "imei": "353691840428873",
    "projectId": "TND-001",
    "externalProjectId": "37",
    "fuelReading": 58.87,
    "tankCapacity": 107,
    "fuelPercent": 55.02,
    "unit": "ltr",
    "ignition": "--",
    "status": "IDLE",
    "location": "NH136, Thavuthakkulam, Tamil Nadu (SW)",
    "readingAt": "2026-04-21T06:55:53.000Z",
    "fetchedAt": "2026-04-21T07:00:01.314Z",
    "deltaFromPrev": -0.32,
    "eventType": "NORMAL",
    "source": "CRON",
    "raw": { /* full provider payload */ }
  }
}
```

### 3.2 Reading history
```
GET /fueltelemetry/asset/:assetId/history?from=&to=&eventType=&limit=
```
| Query | Type | Notes |
|---|---|---|
| `from` | ISO date string | optional |
| `to` | ISO date string | optional |
| `eventType` | `NORMAL` \| `REFUEL` \| `DRAIN` | optional |
| `limit` | number | default 200, hard cap recommended on UI side |

**Response**
```jsonc
{ "status": true, "count": 12, "data": [ /* array of log docs, newest first */ ] }
```

### 3.3 Manual sync — one asset
```
POST /fueltelemetry/sync/:assetId
```
- Forces an immediate fetch from Diztek for that asset.
- Use case: "Refresh now" button on the asset detail page.
- Returns either `{ logId, eventType, fuelReading, deltaFromPrev }` or `{ skipped: true, reason }`.

```jsonc
{ "status": true, "data": { "skipped": true, "reason": "duplicate readingAt" } }
// or
{ "status": true, "data": { "logId": "...", "eventType": "REFUEL", "fuelReading": 92.4, "deltaFromPrev": 33.5 } }
```

### 3.4 Manual sync — all active assets
```
POST /fueltelemetry/sync-all
```
- Admin-only screen. Same job the cron runs.
- May take 30s+ depending on fleet size — show a spinner and avoid double-clicks.

```jsonc
{ "status": true, "data": { "total": 14, "synced": 12, "skipped": 1, "failed": 1, "refuels": 2, "drains": 0 } }
```

---

## 4. Field reference (for typed clients)

```ts
type EventType = "NORMAL" | "REFUEL" | "DRAIN";
type Source    = "CRON" | "MANUAL" | "WEBHOOK";

interface FuelTelemetryLog {
  _id: string;
  assetId: string;            // MachineryAsset _id
  assetCode: string;          // human id like "EX-01"
  plateNumber: string;
  imei: string;
  projectId: string;
  externalProjectId: string;  // Diztek project_id
  fuelReading: number | null; // litres
  tankCapacity: number | null;
  fuelPercent: number | null; // 0–100
  unit: string;               // "ltr"
  ignition: string;           // "ON" | "OFF" | "--"
  status: string;             // "IDLE" | "MOVING" | ...
  location: string;
  lat?: number;
  lng?: number;
  readingAt: string;          // ISO
  fetchedAt: string;          // ISO
  deltaFromPrev: number | null;
  eventType: EventType;
  source: Source;
  raw: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

interface AssetFuelSummary {
  lastSyncAt?: string;
  lastFuelReading?: number;
  lastTankCapacity?: number;
  lastFuelPercent?: number;
  lastStatus?: string;
  lastIgnition?: string;
  lastLocation?: string;
  lastReadingAt?: string;
  lastError?: string | null;
}
```

`AssetFuelSummary` is on `MachineryAsset.fuelTelemetry` — already returned by the existing `GET /machineryasset/:id` endpoint, no change needed there.

---

## 5. Suggested UI

### Asset Detail page — Fuel widget
Source: `MachineryAsset.fuelTelemetry`. No new request needed.

```
┌─────────────────────────────────────────────────┐
│ Fuel              [Refresh now]   [View history]│
│ ─────────────────────────────────────────────── │
│  ████████░░░░░░  55%   58.87 / 107 ltr          │
│  Status: IDLE · Ignition: --                    │
│  📍 NH136, Thavuthakkulam, TN                   │
│  Reading: 21 Apr, 12:25 PM IST                  │
│  Last synced: 2 min ago                         │
└─────────────────────────────────────────────────┘
```

- "Refresh now" → `POST /fueltelemetry/sync/:assetId`, then re-fetch the asset.
- Show a small red dot if `fuelTelemetry.lastError` is non-null, with a tooltip.
- If `lastSyncAt` is older than ~12 hrs, show "stale" badge.

### History page (optional)
- Table: time, fuel %, fuel ltr, delta, event, status, location.
- Highlight rows with `eventType === "REFUEL"` (green) or `"DRAIN"` (red).
- Filter by `eventType` and date range using the query params above.
- Optional line chart of `fuelReading` over `readingAt`. Pin REFUEL/DRAIN events as vertical markers.

### Admin — Sync All
- Button on a settings/ops page calling `POST /fueltelemetry/sync-all`.
- Display the returned stats `{ total, synced, skipped, failed, refuels, drains }` as a toast.

---

## 6. Polling & caching

- **Don't poll the latest endpoint aggressively** — the cron only updates every 6 hrs in prod. Refetch on mount + on user-triggered "Refresh now" is enough.
- Use SWR / React Query with a stale time of 5 minutes; the data won't change faster than that anyway.
- After a successful manual sync, invalidate both the asset query and the history query for that asset.

---

## 7. Error handling

| Status | Meaning | UI behaviour |
|---|---|---|
| `400` | Invalid `assetId` (not a Mongo ObjectId) | Programming error — should never reach the UI |
| `401/403` | Auth or RBAC failure | Redirect to login / hide the action |
| `404` | Asset not found (manual sync only) | Toast: "Asset not found" |
| `500` with message containing `vehicle_number mismatch` | Provider returned data for a different vehicle | Show inline warning on the widget — likely a misconfigured `serialNumber` or `gps.deviceId` |
| `500` with `Diztek auth failed` / `getLiveFuelData failed` | Upstream issue | Retry-once button; if it persists, hide the widget and surface `lastError` from the summary |
| `500` with `missing env vars` | Backend mis-configured | Not the user's problem — log to Sentry |

If the user has read access but `MachineryAsset.fuelTelemetry.lastSyncAt` is missing, render: **"Telemetry not yet synced. Try again in a few minutes."**

---

## 8. Things the backend does NOT do (yet)

So the frontend doesn't make wrong assumptions:
- No WebSocket / push — only the cron and manual sync trigger updates.
- No automatic creation of `MachineDailyLog.fuelIssued` on a REFUEL event. If you want that workflow, the user will see a notification later (TBD) and confirm it manually.
- No backfill of historical readings — the provider's `getLiveFuelData` only returns the latest snapshot. History grows from the moment we start syncing.
- No lat/lng yet — the provider currently returns free-text `location`. The fields exist on the model and will populate automatically if the provider starts sending coordinates.

---

## 9. Quick examples

### React Query + fetch
```ts
async function api(path: string, init?: RequestInit) {
  const res = await fetch(`${BASE_URL}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  const json = await res.json();
  if (!json.status) throw new Error(json.message || "Request failed");
  return json.data;
}

export const useLatestFuel = (assetId: string) =>
  useQuery({
    queryKey: ["fuel", "latest", assetId],
    queryFn: () => api(`/fueltelemetry/asset/${assetId}/latest`),
    staleTime: 5 * 60 * 1000,
    enabled: !!assetId,
  });

export const useFuelHistory = (assetId: string, params: { from?: string; to?: string; eventType?: string; limit?: number }) =>
  useQuery({
    queryKey: ["fuel", "history", assetId, params],
    queryFn: () => api(`/fueltelemetry/asset/${assetId}/history?${new URLSearchParams(params as any)}`),
    enabled: !!assetId,
  });

export const useManualSync = () =>
  useMutation({
    mutationFn: (assetId: string) => api(`/fueltelemetry/sync/${assetId}`, { method: "POST" }),
  });
```

### Plain curl (for QA)
```bash
# Latest
curl -H "Authorization: Bearer $TOKEN" \
  "$API/fueltelemetry/asset/665fa1.../latest"

# History — last 7 days, refuels only
curl -H "Authorization: Bearer $TOKEN" \
  "$API/fueltelemetry/asset/665fa1.../history?from=2026-04-21&eventType=REFUEL"

# Manual sync
curl -X POST -H "Authorization: Bearer $TOKEN" \
  "$API/fueltelemetry/sync/665fa1..."
```

---

## 10. Checklist for the FE PR

- [ ] Add Fuel widget to `MachineryAsset` detail page (reads from `fuelTelemetry` already on the asset).
- [ ] "Refresh now" button gated by `assets.machinery.edit` permission.
- [ ] History tab/page with date range + event-type filter.
- [ ] Format `readingAt` as IST (the backend already converts the provider's IST string to UTC ISO; format with `Asia/Kolkata` for display).
- [ ] Show `lastError` as a non-blocking inline warning if present.
- [ ] Admin "Sync all" action behind an `assets.machinery.edit` guard.
