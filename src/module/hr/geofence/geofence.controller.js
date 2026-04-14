import GeofenceService from "./geofence.service.js";

export const createGeofence = async (req, res) => {
  try {
    const data = await GeofenceService.createGeofence(req.body, req.user._id);
    res.status(201).json({ status: true, message: "Geofence created successfully", data });
  } catch (err) {
    res.status(err.statusCode || 500).json({ status: false, message: err.message });
  }
};

export const getAllGeofences = async (req, res) => {
  try {
    const { isActive, tenderId, page, limit, search } = req.query;
    const fromdate = req.query.fromdate || null;
    const todate   = req.query.todate   || null;
    const result = await GeofenceService.getAll({ isActive, tenderId, page, limit, search, fromdate, todate });
    if (page || limit) {
      res.status(200).json({
        status: true,
        currentPage: result.page,
        totalPages: Math.ceil(result.total / result.limit),
        totalCount: result.total,
        data: result.data,
      });
    } else {
      res.status(200).json({ status: true, data: result });
    }
  } catch (err) {
    res.status(500).json({ status: false, message: err.message });
  }
};

export const getGeofenceById = async (req, res) => {
  try {
    const data = await GeofenceService.getById(req.params.id);
    res.status(200).json({ status: true, data });
  } catch (err) {
    res.status(err.statusCode || 500).json({ status: false, message: err.message });
  }
};

export const updateGeofence = async (req, res) => {
  try {
    const data = await GeofenceService.updateGeofence(req.params.id, req.body);
    res.status(200).json({ status: true, message: "Geofence updated successfully", data });
  } catch (err) {
    res.status(err.statusCode || 500).json({ status: false, message: err.message });
  }
};

export const deleteGeofence = async (req, res) => {
  try {
    await GeofenceService.deleteGeofence(req.params.id);
    res.status(200).json({ status: true, message: "Geofence deleted successfully" });
  } catch (err) {
    res.status(err.statusCode || 500).json({ status: false, message: err.message });
  }
};

export const toggleGeofenceActive = async (req, res) => {
  try {
    const data = await GeofenceService.toggleActive(req.params.id);
    res.status(200).json({ status: true, message: `Geofence ${data.isActive ? "activated" : "deactivated"}`, data });
  } catch (err) {
    res.status(err.statusCode || 500).json({ status: false, message: err.message });
  }
};
