import { Router } from "express";
import multer from "multer";
import { verifyJWT, verifyPermission } from "../../../../common/Auth.middlware.js";
import {
  getNextBillId,
  getList,
  getHistory,
  getBillById,
  getDetails,
  createBill,
  updateBill,
  deleteBill,
  approveBill,
  updateStatus,
  uploadBillCSV,
} from "./clientbilling.controller.js";

const upload = multer({ dest: "uploads/" });

const billingRouter = Router();

const auth  = verifyJWT;
const read  = verifyPermission("finance", "clientbilling", "read");
const create = verifyPermission("finance", "clientbilling", "create");
const edit  = verifyPermission("finance", "clientbilling", "edit");
const del   = verifyPermission("finance", "clientbilling", "delete");

billingRouter.get("/next-id",                         auth, read,   getNextBillId);
billingRouter.get("/list",                            auth, read,   getList);
billingRouter.get("/history/:tender_id",              auth, read,   getHistory);
billingRouter.get("/details/:tender_id/:bill_id",     auth, read,   getDetails);
billingRouter.get("/:id",                             auth, read,   getBillById);

billingRouter.post("/create",                         auth, create, createBill);
billingRouter.post("/upload-csv",                     auth, create, upload.single("file"), uploadBillCSV);
billingRouter.patch("/approve/:id",                   auth, edit,   approveBill);
billingRouter.patch("/status/:id",                    auth, edit,   updateStatus);
billingRouter.patch("/update/:id",                    auth, edit,   updateBill);
billingRouter.delete("/delete/:id",                   auth, del,    deleteBill);

export default billingRouter;

