import { Router } from "express";
import { verifyJWT, verifyPermission } from "../../../common/Auth.middlware.js";
import { getAllSettings, updateSetting } from "./financesettings.controller.js";

const financeSettingsRouter = Router();

// GET /finance/settings — list all configurable settings (admin read)
financeSettingsRouter.get(
  "/",
  verifyJWT,
  verifyPermission("settings", "master", "read"),
  getAllSettings
);

// PUT /finance/settings/:key — update a setting value (admin only)
financeSettingsRouter.put(
  "/:key",
  verifyJWT,
  verifyPermission("settings", "master", "edit"),
  updateSetting
);

export default financeSettingsRouter;
