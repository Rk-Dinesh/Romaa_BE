import { Router } from "express";
import { verifyJWT } from "../../../common/Auth.middlware.js";
import {
  addProposalToTender,
  getEmdByTender,
  getAllEmds,
  updateEmdRecord,
  updateProposalInTender,
  removeProposalFromTender,
  deleteEmdRecord,
  getProposalsPaginated,
  updateProposalWithApprovalRule,
  rejectProposal
} from "./emd.controller.js";

const emdrouter = Router();
emdrouter.use(verifyJWT);

// Add proposal to a tender
emdrouter.post("/addproposal/:tender_id", addProposalToTender);

// Get EMD record for a tender
emdrouter.get("/getemd/:tender_id", getEmdByTender);

// Get all EMD records
emdrouter.get("/getall", getAllEmds);

// Get paginated proposals for a tender
emdrouter.get("/proposals/:tender_id", getProposalsPaginated);

// Update full EMD record (all proposals)
emdrouter.put("/update/:tender_id", updateEmdRecord);

// Update a specific proposal's data (amount, bank, date, etc.)
emdrouter.put("/updateproposal/:tender_id/:proposal_id", updateProposalInTender);

// Approve or reject a proposal (syncs Tender.emd.approved_emd_details)
emdrouter.put("/approveproposal/:tender_id/:proposal_id", updateProposalWithApprovalRule);

// Reject a specific proposal (with optional reason)
emdrouter.put("/rejectproposal/:tender_id/:proposal_id", rejectProposal);

// Remove a proposal from the EMD record
emdrouter.delete("/removeproposal/:tender_id/:proposal_id", removeProposalFromTender);

// Delete entire EMD record for a tender
emdrouter.delete("/delete/:tender_id", deleteEmdRecord);

export default emdrouter;
