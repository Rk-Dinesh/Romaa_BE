import { Router } from "express";
import {
  upsertDepartment,
  listDepartments,
  getDepartment,
  deleteDepartment,
} from "./department.controller.js";
import { verifyJWT, verifyPermission } from "../../../common/Auth.middlware.js";

const DepartmentRoute = Router();

DepartmentRoute.get("/list",       verifyJWT, verifyPermission("hr", "employee", "read"),   listDepartments);
DepartmentRoute.get("/:id",        verifyJWT, verifyPermission("hr", "employee", "read"),   getDepartment);
DepartmentRoute.post("/upsert",    verifyJWT, verifyPermission("hr", "employee", "edit"),   upsertDepartment);
DepartmentRoute.delete("/:id",     verifyJWT, verifyPermission("hr", "employee", "delete"), deleteDepartment);

export default DepartmentRoute;
