import logger from "../../../config/logger.js";
import MachineryAsset from "../machinery/machineryasset.model.js";
import FuelTelemetryLog from "./fueltelemetry.model.js";
import { getLiveFuelData } from "../../../integrations/diztekFuel/diztekFuel.client.js";
import { resolveExpectedGeofence, evaluateBreach } from "./geofenceBreach.js";
import NotificationService from "../../notifications/notification.service.js";

const REFUEL_THRESHOLD_LTR = Number(process.env.FUEL_REFUEL_THRESHOLD_LTR || 10);
const EXTERNAL_PROJECT_ID  = process.env.FUEL_API_PROJECT_ID || "37";
const SYNC_BATCH_CONCURRENCY = 5;

/**
 * Provider returns datetime as "DD-MM-YYYY HH:mm:ss". Convert to a real Date.
 * Falls back to "now" if the string is missing/malformed.
 */
function parseProviderDate(str) {
  if (!str || typeof str !== "string") return new Date();
  const m = str.match(/^(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/);
  if (!m) return new Date();
  const [, dd, mm, yyyy, h, min, s] = m;
  // Treat provider time as IST (matches their app); convert to UTC
  const ist = new Date(`${yyyy}-${mm}-${dd}T${h}:${min}:${s}+05:30`);
  return isNaN(ist.getTime()) ? new Date() : ist;
}

function classifyEvent(deltaFromPrev) {
  if (deltaFromPrev == null || isNaN(deltaFromPrev)) return "NORMAL";
  if (deltaFromPrev >=  REFUEL_THRESHOLD_LTR) return "REFUEL";
  if (deltaFromPrev <= -REFUEL_THRESHOLD_LTR) return "DRAIN";
  return "NORMAL";
}

class FuelTelemetryService {
  /**
   * Sync ONE asset against the provider. Writes a new FuelTelemetryLog and
   * updates the asset's fuelTelemetry summary. Returns { skipped, reason } or
   * { logId, eventType, fuelReading }.
   */
  static async syncAsset(asset, { source = "CRON" } = {}) {
    if (!asset) throw new Error("asset is required");

    const plateNo = asset.serialNumber;
    const imei    = asset?.gps?.deviceId;

    if (!plateNo || !imei) {
      return { skipped: true, reason: "missing serialNumber or gps.deviceId" };
    }

    let readings;
    try {
      readings = await getLiveFuelData({ plateNo, imei });
    } catch (err) {
      await MachineryAsset.updateOne(
        { _id: asset._id },
        { $set: { "fuelTelemetry.lastError": err.message, "fuelTelemetry.lastSyncAt": new Date() } }
      );
      throw err;
    }

    if (!readings.length) {
      await MachineryAsset.updateOne(
        { _id: asset._id },
        { $set: {
            "fuelTelemetry.lastSyncAt": new Date(),
            "fuelTelemetry.lastError":  "no readings returned",
        } }
      );
      return { skipped: true, reason: "no readings" };
    }

    // Provider returns most-recent first in tests; pick [0] defensively.
    const r = readings[0];

    // Sanity check: provider must echo back the same vehicle we asked about.
    // Guards against shared-token races or backend mis-routing.
    const returnedPlate = String(r.vehicle_number || "").trim().toUpperCase();
    const expectedPlate = String(plateNo).trim().toUpperCase();
    if (returnedPlate && returnedPlate !== expectedPlate) {
      const msg = `vehicle_number mismatch: expected=${expectedPlate} got=${returnedPlate}`;
      await MachineryAsset.updateOne(
        { _id: asset._id },
        { $set: { "fuelTelemetry.lastSyncAt": new Date(), "fuelTelemetry.lastError": msg } }
      );
      throw new Error(msg);
    }

    const readingAt = parseProviderDate(r.datetime);

    // Skip if we already have this exact reading (no-op when the truck is parked)
    const existing = await FuelTelemetryLog.findOne({ assetId: asset._id, readingAt }).select("_id").lean();
    if (existing) {
      await MachineryAsset.updateOne(
        { _id: asset._id },
        { $set: { "fuelTelemetry.lastSyncAt": new Date(), "fuelTelemetry.lastError": null } }
      );
      return { skipped: true, reason: "duplicate readingAt" };
    }

    // Find the previous reading for delta computation
    const prev = await FuelTelemetryLog
      .findOne({ assetId: asset._id })
      .sort({ readingAt: -1 })
      .select("fuelReading")
      .lean();

    const fuelReading  = Number(r.fuel_reading);
    const tankCapacity = Number(r.tank_capacity);
    const fuelPercent  = tankCapacity > 0 ? Number(((fuelReading / tankCapacity) * 100).toFixed(2)) : null;
    const deltaFromPrev = prev?.fuelReading != null
      ? Number((fuelReading - prev.fuelReading).toFixed(2))
      : null;
    const eventType = classifyEvent(deltaFromPrev);

    const doc = await FuelTelemetryLog.create({
      assetId:   asset._id,
      assetCode: asset.assetId,
      plateNumber: plateNo,
      imei,
      projectId: asset.projectId,
      externalProjectId: EXTERNAL_PROJECT_ID,
      fuelReading, tankCapacity, fuelPercent,
      unit:     r.unit || "ltr",
      ignition: r.ignition,
      status:   r.status,
      location: r.location,
      readingAt,
      fetchedAt: new Date(),
      deltaFromPrev,
      eventType,
      source,
      raw: r,
    });

    // Geofence breach evaluation against the assigned project's zone
    let breach = { status: "UNKNOWN", distance: null, zone: null };
    if (r.lat != null && r.lng != null) {
      const fence = await resolveExpectedGeofence(asset);
      breach = evaluateBreach({ lat: r.lat, lng: r.lng }, fence);
    }

    const $set = {
      "fuelTelemetry.lastSyncAt":      new Date(),
      "fuelTelemetry.lastFuelReading": fuelReading,
      "fuelTelemetry.lastTankCapacity":tankCapacity,
      "fuelTelemetry.lastFuelPercent": fuelPercent,
      "fuelTelemetry.lastStatus":      r.status,
      "fuelTelemetry.lastIgnition":    r.ignition,
      "fuelTelemetry.lastLocation":    r.location,
      "fuelTelemetry.lastReadingAt":   readingAt,
      "fuelTelemetry.lastError":       null,
      "gps.lastPingDate":              new Date(),
      "gps.lastGeofenceCheckAt":       new Date(),
      "gps.lastGeofenceStatus":        breach.status,
    };
    if (r.lat != null && r.lng != null) {
      $set["gps.lastKnownLocation"] = {
        lat: Number(r.lat),
        lng: Number(r.lng),
        address: r.location,
      };
    }
    if (breach.zone) $set["gps.lastGeofenceZoneId"] = breach.zone._id;

    await MachineryAsset.updateOne({ _id: asset._id }, { $set });

    // Surface a notification on a fresh OUTSIDE breach (asset just left zone)
    if (breach.status === "OUTSIDE" && asset.gps?.lastGeofenceStatus !== "OUTSIDE") {
      try {
        const roleIds = await NotificationService.getRoleIdsByPermission("asset", "fuel_telemetry", "read");
        if (roleIds.length > 0) {
          await NotificationService.notify({
            title: `Geofence breach: ${asset.assetId}`,
            message: `${asset.assetName} (${asset.assetId}) is ${breach.distance}m outside the ${breach.zone?.name || "assigned"} zone.`,
            audienceType: "role",
            roles: roleIds,
            category: "alert",
            priority: "high",
            module: "asset",
            actionUrl: `/machineryasset/dashboard/${asset.assetId}`,
            actionLabel: "View asset",
          });
        }
      } catch (_) { /* never fail sync on notification error */ }
    }

    return { logId: doc._id, eventType, fuelReading, deltaFromPrev, geofenceStatus: breach.status };
  }

  /**
   * Sync every Active asset that has both serialNumber and gps.deviceId.
   * Failures on individual assets are logged but never abort the run.
   */
  static async syncAllActive({ source = "CRON" } = {}) {
    const assets = await MachineryAsset.find({
      currentStatus: "Active",
      serialNumber:    { $nin: [null, ""] },
      "gps.deviceId":  { $nin: [null, ""] },
    }).lean();

    const stats = { total: assets.length, synced: 0, skipped: 0, failed: 0, refuels: 0, drains: 0 };

    // Process in small concurrent batches to avoid hammering the provider
    for (let i = 0; i < assets.length; i += SYNC_BATCH_CONCURRENCY) {
      const batch = assets.slice(i, i + SYNC_BATCH_CONCURRENCY);
      const results = await Promise.allSettled(
        batch.map((a) => FuelTelemetryService.syncAsset(a, { source }))
      );
      for (const [idx, r] of results.entries()) {
        const asset = batch[idx];
        if (r.status === "fulfilled") {
          if (r.value.skipped) stats.skipped++;
          else {
            stats.synced++;
            if (r.value.eventType === "REFUEL") stats.refuels++;
            if (r.value.eventType === "DRAIN")  stats.drains++;
          }
        } else {
          stats.failed++;
          logger.error(`[fuelSync] asset ${asset.assetId} failed: ${r.reason?.message || r.reason}`);
        }
      }
    }
    logger.info(`[fuelSync] done — total=${stats.total} synced=${stats.synced} skipped=${stats.skipped} failed=${stats.failed} refuels=${stats.refuels} drains=${stats.drains}`);
    return stats;
  }

  static async getLatestForAsset(assetId) {
    return FuelTelemetryLog.findOne({ assetId }).sort({ readingAt: -1 }).lean();
  }

  static async getHistory({ assetId, from, to, eventType, limit = 200 }) {
    const q = {};
    if (assetId)   q.assetId = assetId;
    if (eventType) q.eventType = eventType;
    if (from || to) {
      q.readingAt = {};
      if (from) q.readingAt.$gte = new Date(from);
      if (to)   q.readingAt.$lte = new Date(to);
    }
    return FuelTelemetryLog.find(q).sort({ readingAt: -1 }).limit(Number(limit)).lean();
  }
}

export default FuelTelemetryService;
