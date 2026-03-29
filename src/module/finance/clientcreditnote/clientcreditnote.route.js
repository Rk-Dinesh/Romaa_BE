import { Router } from "express";
import { verifyJWT, verifyPermission } from "../../../../common/Auth.middlware.js";
import {
  getList,
  getById,
  createCCN,
  updateCCN,
  deleteCCN,
  approveCCN,
  updateStatus,
} from "./clientcreditnote.controller.js";

const clientCNRouter = Router();

const auth   = verifyJWT;
const read   = verifyPermission("finance", "clientbilling", "read");
const create = verifyPermission("finance", "clientbilling", "create");
const edit   = verifyPermission("finance", "clientbilling", "edit");
const del    = verifyPermission("finance", "clientbilling", "delete");

clientCNRouter.get("/list",          auth, read,   getList);
clientCNRouter.get("/:id",           auth, read,   getById);

clientCNRouter.post("/create",       auth, create, createCCN);
clientCNRouter.patch("/approve/:id", auth, edit,   approveCCN);
clientCNRouter.patch("/status/:id",  auth, edit,   updateStatus);
clientCNRouter.patch("/update/:id",  auth, edit,   updateCCN);
clientCNRouter.delete("/delete/:id", auth, del,    deleteCCN);

export default clientCNRouter;
