import { Router } from "express";
import {
  addPenalty,
  getPenalties,
  updatePenalty,
  removePenalty,
  getPaginatedPenalties,
} from "./penalities.controller.js";

const penaltyRouter = Router();

// Add a penalty for a tender
penaltyRouter.post("/add", addPenalty);

// Get penalties for a tender
penaltyRouter.get("/gettender/:tender_id", getPenalties);

// Update a penalty entry by penalty_id
penaltyRouter.put("/update/:tender_id/:penalty_id", updatePenalty);

// Remove a penalty by penalty_id
penaltyRouter.delete("/remove/:tender_id/:penalty_id", removePenalty);

// Get paginated penalties with optional search
penaltyRouter.get("/penalties/:tender_id", getPaginatedPenalties);

export default penaltyRouter;
