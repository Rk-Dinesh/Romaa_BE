import { Router } from "express";
import { createSteelEstimate } from "./steelestimate.controller.js";

const steelestimaterouter = Router();

steelestimaterouter.post("/create", createSteelEstimate);

export default steelestimaterouter;