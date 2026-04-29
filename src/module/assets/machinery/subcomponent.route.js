import express from "express";
import { verifyJWT, verifyPermission } from "../../../common/Auth.middlware.js";
import {
  addSubComponent,
  replaceSubComponent,
  listSubComponents,
} from "./subcomponent.controller.js";

const subComponentRouter = express.Router();
subComponentRouter.use(verifyJWT);

subComponentRouter.get("/:assetId",                       verifyPermission("asset", "subcomponent", "read"),   listSubComponents);
subComponentRouter.post("/:assetId/add",                  verifyPermission("asset", "subcomponent", "create"), addSubComponent);
subComponentRouter.post("/:assetId/replace/:subId",       verifyPermission("asset", "subcomponent", "edit"),   replaceSubComponent);

export default subComponentRouter;
