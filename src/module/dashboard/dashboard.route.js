import { Router } from "express";
import { getDashboard } from "./dashboard.controller.js";
import { verifyJWT } from "../../common/Auth.middlware.js";

const dashboardRoute = Router();

dashboardRoute.get("/", verifyJWT, getDashboard);

export default dashboardRoute;
