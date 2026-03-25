import { Router } from "express";
import {
  getAll,
  getById,
  getByCode,
  create,
  update,
  softDelete,
} from "./companycashaccount.controller.js";
import { verifyJWT } from "../../../common/Auth.middlware.js";

const companyCashAccountRouter = Router();

// GET /companycashaccount/list
companyCashAccountRouter.get(
  "/list",
  verifyJWT,
  getAll
);

// GET /companycashaccount/by-code/:code
companyCashAccountRouter.get(
  "/by-code/:code",
  verifyJWT,
  getByCode
);

// POST /companycashaccount/create
companyCashAccountRouter.post(
  "/create",
  verifyJWT,
  create
);

// PATCH /companycashaccount/update/:id
companyCashAccountRouter.patch(
  "/update/:id",
  verifyJWT,
  update
);

// DELETE /companycashaccount/delete/:id
companyCashAccountRouter.delete(
  "/delete/:id",
  verifyJWT,
  softDelete
);

// GET /companycashaccount/:id  ← must be last
companyCashAccountRouter.get(
  "/:id",
  verifyJWT,
  getById
);

export default companyCashAccountRouter;
