import { Router } from "express";
import { verifyJWT, verifyPermission } from "../../../common/Auth.middlware.js";
import { getAll } from "./financeMetrics.js";

const metricsRouter = Router();

// GET /finance/metrics — admin-only snapshot of in-process counters
metricsRouter.get(
  "/metrics",
  verifyJWT,
  verifyPermission("finance", "finance_settings", "read"),
  (_req, res) => {
    res.status(200).json({ status: true, data: getAll() });
  },
);

export default metricsRouter;
