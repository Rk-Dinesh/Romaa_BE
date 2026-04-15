import { Router } from "express";
import { handleGlobalQuery, handleInsightQuery } from "./aiChat.controller.js";
import { aiSafetyMiddleware, verifyJWT } from "../../common/Auth.middlware.js";

const aiRouter = Router();



// ── Global natural-language ERP query (all modules) ──────────────────────────
// POST /ai/general-query
// Body: { prompt: "..." }
// Returns data from whichever ERP modules the user has read access to.
aiRouter.post(
  "/general-query",
  verifyJWT,
  aiSafetyMiddleware,
  handleGlobalQuery
);

// ── Proactive insight / suggest (all modules) ────────────────────────────────
// POST /ai/suggest
// No body required. Scans all permitted modules for pending/alert items
// and returns AI-generated action items and risk alerts.
aiRouter.post(
  "/suggest",
  verifyJWT,
  handleInsightQuery
);

export default aiRouter;
