import express from "express";
import { verifyJWT, verifyPermission } from "../../../common/Auth.middlware.js";
import {
  createPlan,
  getAllPlans,
  getPlanById,
  updatePlan,
  togglePlan,
  getDuePlans,
} from "./pmplan.controller.js";

const pmPlanRouter = express.Router();
pmPlanRouter.use(verifyJWT);

pmPlanRouter.post("/create",                  verifyPermission("asset", "preventive_maintenance", "create"), createPlan);
pmPlanRouter.get("/getall",                   verifyPermission("asset", "preventive_maintenance", "read"),   getAllPlans);
pmPlanRouter.get("/due",                      verifyPermission("asset", "preventive_maintenance", "read"),   getDuePlans);
pmPlanRouter.get("/getbyid/:planId",          verifyPermission("asset", "preventive_maintenance", "read"),   getPlanById);
pmPlanRouter.put("/update/:planId",           verifyPermission("asset", "preventive_maintenance", "edit"),   updatePlan);
pmPlanRouter.patch("/toggle/:planId",         verifyPermission("asset", "preventive_maintenance", "edit"),   togglePlan);

export default pmPlanRouter;
