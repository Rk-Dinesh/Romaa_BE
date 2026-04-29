import express from "express";
import { verifyJWT, verifyPermission } from "../../../common/Auth.middlware.js";
import {
  createWorkOrder,
  getAllWorkOrders,
  getWorkOrderById,
  updateWorkOrder,
  transitionWorkOrder,
  autoCreatePmWorkOrders,
} from "./workorder.controller.js";

const workOrderRouter = express.Router();
workOrderRouter.use(verifyJWT);

workOrderRouter.post("/create",                         verifyPermission("asset", "work_order", "create"), createWorkOrder);
workOrderRouter.get("/getall",                          verifyPermission("asset", "work_order", "read"),   getAllWorkOrders);
workOrderRouter.get("/getbyid/:workOrderNo",            verifyPermission("asset", "work_order", "read"),   getWorkOrderById);
workOrderRouter.put("/update/:workOrderNo",             verifyPermission("asset", "work_order", "edit"),   updateWorkOrder);
workOrderRouter.post("/transition/:workOrderNo",        verifyPermission("asset", "work_order", "edit"),   transitionWorkOrder);
workOrderRouter.post("/auto-create-pm",                 verifyPermission("asset", "work_order", "create"), autoCreatePmWorkOrders);

export default workOrderRouter;
