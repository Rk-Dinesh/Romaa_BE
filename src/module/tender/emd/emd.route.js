import { Router } from "express";
import {
  addProposalToTender,
  getEmdByTender,
  getAllEmds,
  updateEmdRecord,
  updateProposalInTender,
  removeProposalFromTender,
  deleteEmdRecord,
  getProposalsPaginated,
  updateProposalWithApprovalRule
} from "./emd.controller.js";

const emdrouter = Router();

// Create or add proposal
emdrouter.post("/addproposal/:tender_id", addProposalToTender);

// Get EMD by tender
emdrouter.get("/getemd/:tender_id", getEmdByTender);

// Get all EMDs
emdrouter.get("/getall", getAllEmds);

// Update entire EMD record
emdrouter.put("/update/:tender_id", updateEmdRecord);

// Update single proposal inside a tender record

emdrouter.put("/updateproposal/:tender_id/:proposal_id", updateProposalWithApprovalRule);

// Remove proposal from tender
emdrouter.delete("/removeproposal/:tender_id/:proposal_id", removeProposalFromTender);

// Delete entire EMD record
emdrouter.delete("/delete/:tender_id", deleteEmdRecord);

emdrouter.get("/proposals/:tender_id", getProposalsPaginated);


export default emdrouter;
