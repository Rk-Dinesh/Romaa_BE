import Geofence from "../../hr/geofence/geofence.model.js";
import Tender from "../../tender/tender/tender.model.js";
import { getDistanceFromLatLonInMeters } from "../../../../utils/geofunction.js";

// Resolve the geofence (if any) that an asset is expected to be inside —
// driven by the asset's projectId → Tender → Geofence chain.
export async function resolveExpectedGeofence(asset) {
  if (!asset?.projectId) return null;
  // projectId is the Tender's tender_id business string
  const tender = await Tender.findOne({ tender_id: asset.projectId }).select("_id").lean();
  if (!tender) return null;
  return await Geofence.findOne({ tenderId: tender._id, isActive: true }).lean();
}

// Returns { status: "INSIDE"|"OUTSIDE"|"UNKNOWN", distance, zone }
export function evaluateBreach({ lat, lng }, geofence) {
  if (geofence == null) return { status: "UNKNOWN", distance: null, zone: null };
  if (lat == null || lng == null) return { status: "UNKNOWN", distance: null, zone: geofence };
  const distance = getDistanceFromLatLonInMeters(
    Number(lat),
    Number(lng),
    Number(geofence.latitude),
    Number(geofence.longitude)
  );
  return {
    status: distance <= geofence.radiusMeters ? "INSIDE" : "OUTSIDE",
    distance: Math.round(distance),
    zone: geofence,
  };
}
