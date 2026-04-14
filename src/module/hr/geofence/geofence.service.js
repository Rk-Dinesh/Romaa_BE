import Geofence from "./geofence.model.js";

class GeofenceService {
  // --- 1. CREATE ---
  static async createGeofence(data, createdBy) {
    const geofence = new Geofence({ ...data, createdBy });
    return await geofence.save();
  }

  // --- 2. GET ALL (optionally filter by active/tenderId) ---
  static async getAll({ isActive, tenderId, page, limit, search, fromdate, todate } = {}) {
    const query = {};
    if (isActive !== undefined) query.isActive = isActive === "true" || isActive === true;
    if (tenderId) query.tenderId = tenderId;
    if (search) {
      const s = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      query.$or = [
        { name:        { $regex: s, $options: "i" } },
        { description: { $regex: s, $options: "i" } },
      ];
    }
    if (fromdate || todate) {
      query.createdAt = {};
      if (fromdate) query.createdAt.$gte = new Date(fromdate);
      if (todate)   query.createdAt.$lte = new Date(todate);
    }
    if (page || limit) {
      const pg   = Math.max(1, parseInt(page)  || 1);
      const lim  = Math.max(1, Math.min(100, parseInt(limit) || 20));
      const skip = (pg - 1) * lim;
      const [data, total] = await Promise.all([
        Geofence.find(query).populate("tenderId", "tender_id tender_project_name site_location").sort({ createdAt: -1 }).skip(skip).limit(lim).lean(),
        Geofence.countDocuments(query),
      ]);
      return { data, total, page: pg, limit: lim };
    }
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
