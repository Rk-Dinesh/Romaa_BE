import express from "express";
import { verifyJWT, verifyPermission } from "../../../common/Auth.middlware.js";
import {
  seedSampleData,
  wipeSampleData,
  getSampleDataStatus,
} from "./sampledata.controller.js";

const sampleDataRouter = express.Router();
sampleDataRouter.use(verifyJWT);

// Gated by settings.master — admin-only.
sampleDataRouter.get("/status",  verifyPermission("settings", "master", "read"),   getSampleDataStatus);
sampleDataRouter.post("/seed",   verifyPermission("settings", "master", "create"), seedSampleData);
sampleDataRouter.post("/wipe",   verifyPermission("settings", "master", "delete"), wipeSampleData);

export default sampleDataRouter;
