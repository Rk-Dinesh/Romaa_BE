import { Router } from "express";
import { verifyJWT, verifyPermission } from "../../../common/Auth.middlware.js";
import { startArchival, getArchivalStatus, listArchivalJobs } from "./archival.controller.js";

const archivalRouter = Router();

archivalRouter.post(
  "/start",
  verifyJWT,
  verifyPermission("finance", "audit_trail", "create"),
  startArchival
);

archivalRouter.get(
  "/jobs",
  verifyJWT,
  verifyPermission("finance", "audit_trail", "read"),
  listArchivalJobs
);

archivalRouter.get(
  "/:fin_year",
  verifyJWT,
  verifyPermission("finance", "audit_trail", "read"),
  getArchivalStatus
);

export default archivalRouter;
