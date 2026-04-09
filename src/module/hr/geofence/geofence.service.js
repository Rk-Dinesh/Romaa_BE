import Geofence from "./geofence.model.js";

class GeofenceService {
  // --- 1. CREATE ---
  static async createGeofence(data, createdBy) {
    const geofence = new Geofence({ ...data, createdBy });
    return await geofence.save();
  }

  // --- 2. GET ALL (optionally filter by active/tenderId) ---
  static async getAll({ isActive, tenderId } = {}) {
    const query = {};
    if (isActive !== undefined) query.isActive = isActive === "true" || isActive === true;
    if (tenderId) query.tenderId = tenderId;
    return await Geofence.find(query)
      .populate("tenderId", "tender_id tender_project_name site_location")
      .sort({ createdAt: -1 });
  }

  // --- 3. GET BY ID ---
  static async getById(id) {
    const geofence = await Geofence.findById(id)
      .populate("tenderId", "tender_id tender_project_name site_location");
    if (!geofence) throw { statusCode: 404, message: "Geofence not found" };
    return geofence;
  }

  // --- 4. UPDATE ---
  static async updateGeofence(id, data) {
    const allowed = ["name", "latitude", "longitude", "radiusMeters", "isActive", "tenderId", "description"];
    const update = {};
    allowed.forEach((k) => { if (data[k] !== undefined) update[k] = data[k]; });

    const updated = await Geofence.findByIdAndUpdate(id, { $set: update }, { new: true, runValidators: true });
    if (!updated) throw { statusCode: 404, message: "Geofence not found" };
    return updated;
  }

  // --- 5. DELETE ---
  static async deleteGeofence(id) {
    const deleted = await Geofence.findByIdAndDelete(id);
    if (!deleted) throw { statusCode: 404, message: "Geofence not found" };
    return deleted;
  }

  // --- 6. TOGGLE ACTIVE STATUS ---
  static async toggleActive(id) {
    const geofence = await Geofence.findById(id);
    if (!geofence) throw { statusCode: 404, message: "Geofence not found" };
    geofence.isActive = !geofence.isActive;
    return await geofence.save();
  }
}

export default GeofenceService;
