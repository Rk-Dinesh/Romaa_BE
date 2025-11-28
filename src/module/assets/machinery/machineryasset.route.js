import express from "express";
import { addMeterReading, addTripDetails, assignProjectAndSite, createMachinery, getAssetsByProject, getMeterReadingHistory, getTripHistory, updateStatus } from "./machineryasset.controller.js";


const machineryrouter = express.Router();

// Create machinery
machineryrouter.post("/api/machinery-assets", createMachinery);

// Assign project and site details
machineryrouter.put("/api/machinery-assets/:assetId/assign-project-site", assignProjectAndSite);

// Get assets by project
machineryrouter.get("/api/machinery-assets/project/:projectId", getAssetsByProject);

// Update currentStatus / availabilityStatus
machineryrouter.patch("/api/machinery-assets/:assetId/status", updateStatus);

// Get meter reading history
machineryrouter.get("/api/machinery-assets/:assetId/meter-reading-history", getMeterReadingHistory);

// Get trip history
machineryrouter.get("/api/machinery-assets/:assetId/trip-history", getTripHistory);

// POST meter reading
machineryrouter.post("/api/machinery-assets/:assetId/meter-reading", addMeterReading);

// POST trip details
machineryrouter.post("/api/machinery-assets/:assetId/trip-details", addTripDetails);



export default machineryrouter;
