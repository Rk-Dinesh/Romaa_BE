import express from "express";
import { verifyJWT, verifyPermission } from "../../../common/Auth.middlware.js";
import {
  createTemplate,
  listTemplates,
  getTemplate,
  updateTemplate,
  submitInspection,
  listSubmissions,
  getSubmission,
} from "./inspection.controller.js";

const inspectionRouter = express.Router();
inspectionRouter.use(verifyJWT);

// Templates
inspectionRouter.post("/templates",                    verifyPermission("asset", "inspection", "create"), createTemplate);
inspectionRouter.get("/templates",                     verifyPermission("asset", "inspection", "read"),   listTemplates);
inspectionRouter.get("/templates/:templateId",         verifyPermission("asset", "inspection", "read"),   getTemplate);
inspectionRouter.put("/templates/:templateId",         verifyPermission("asset", "inspection", "edit"),   updateTemplate);

// Submissions
inspectionRouter.post("/submit",                       verifyPermission("asset", "inspection", "create"), submitInspection);
inspectionRouter.get("/submissions",                   verifyPermission("asset", "inspection", "read"),   listSubmissions);
inspectionRouter.get("/submissions/:inspectionId",     verifyPermission("asset", "inspection", "read"),   getSubmission);

export default inspectionRouter;
