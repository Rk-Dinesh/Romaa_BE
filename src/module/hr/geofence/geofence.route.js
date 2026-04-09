import { Router } from "express";
import {
  createGeofence,
  getAllGeofences,
  getGeofenceById,
  updateGeofence,
  deleteGeofence,
  toggleGeofenceActive,
} from "./geofence.controller.js";
import { verifyJWT, verifyPermission } from "../../../common/Auth.middlware.js";

const GeofenceRoute = Router();

GeofenceRoute.post("/create",        verifyJWT, verifyPermission("hr", "geofence", "create"), createGeofence);
GeofenceRoute.get("/list",           verifyJWT, verifyPermission("hr", "geofence", "read"),   getAllGeofences);
GeofenceRoute.get("/getbyId/:id",    verifyJWT, verifyPermission("hr", "geofence", "read"),   getGeofenceById);
GeofenceRoute.put("/update/:id",     verifyJWT, verifyPermission("hr", "geofence", "edit"),   updateGeofence);
GeofenceRoute.delete("/delete/:id",  verifyJWT, verifyPermission("hr", "geofence", "delete"), deleteGeofence);
GeofenceRoute.patch("/toggle/:id",   verifyJWT, verifyPermission("hr", "geofence", "edit"),   toggleGeofenceActive);

export default GeofenceRoute;
