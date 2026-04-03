import IdcodeServices from "../../idcode/idcode.service.js";
import TenderModel from "../tender/tender.model.js";
import EmdModel from "./emd.model.js";
import NotificationService from "../../notifications/notification.service.js";

// ── Auto-rank proposals by bid value (lowest = L1) ───────────────────────────
// Runs after every add / update. Proposals with a proposed_amount are sorted
// ascending; the cheapest gets L1, next L2 … up to L5. Proposals without an
// amount retain their existing level.
function assignLevels(proposals) {
  // Separate rankable from un-rankable
  const withAmt  = proposals.filter((p) => Number(p.proposed_amount) > 0);
  const withoutAmt = proposals.filter((p) => !(Number(p.proposed_amount) > 0));

  // Sort ascending: cheapest first
  withAmt.sort((a, b) => Number(a.proposed_amount) - Number(b.proposed_amount));

  // Assign L1–L5 (cap at 5 even if more proposals exist)
  withAmt.forEach((p, i) => {
    p.level = i < 5 ? `L${i + 1}` : `L5+`;
  });

  // Keep un-rankable proposals at the end without changing their level
  return [...withAmt, ...withoutAmt];
}

class EmdService {
  // ── Add a proposal to the EMD record for a tender ─────────────────────────
  static async addProposalToTender(tender_id, proposal, created_by_user = null) {
    if (!tender_id) throw new Error("Tender ID is required to process this EMD request.");
    if (!proposal || !proposal.company_name) throw new Error("Company name is required to submit an EMD proposal.");

    const tender = await TenderModel.findOne({ tender_id });
    if (!tender) throw new Error("Tender record not found for the specified Tender ID.");

    // Generate unique Proposal ID
    const proposalIdName = "PROPOSAL";
    const proposalIdCode = "PRO";
    await IdcodeServices.addIdCode(proposalIdName, proposalIdCode);
    proposal.proposal_id = await IdcodeServices.generateCode(proposalIdName);

    // Auto-compute emd_amount from tender's emd_percentage if provided
    if (proposal.proposed_amount && tender.emd?.emd_percentage) {
      proposal.emd_percentage = tender.emd.emd_percentage;
      proposal.emd_amount = (proposal.proposed_amount * tender.emd.emd_percentage) / 100;
    }

    let emdRecord = await EmdModel.findOne({ tender_id });

    if (!emdRecord) {
      const emdIdName = "EMD";
      const emdIdCode = "EMD";
      await IdcodeServices.addIdCode(emdIdName, emdIdCode);
      const emd_id = await IdcodeServices.generateCode(emdIdName);
      if (!emd_id) throw new Error("Failed to generate EMD reference number. Please try again.");

      emdRecord = new EmdModel({
        tender_id,
        emd_id,
        proposals: [proposal],
        created_by_user,
      });

      // First proposal — still rank it (L1 by default)
      emdRecord.proposals = assignLevels(emdRecord.proposals.map((p) => p.toObject ? p.toObject() : p));
      return await emdRecord.save();
    }

    emdRecord.proposals.push(proposal);

    // Re-rank all proposals by bid value before saving
    emdRecord.proposals = assignLevels(
      emdRecord.proposals.map((p) => (p.toObject ? p.toObject() : p))
    );

    return await emdRecord.save();
  }

  // ── Get EMD record by tender_id ───────────────────────────────────────────
  static async getEmdByTender(tender_id) {
    return await EmdModel.findOne({ tender_id });
  }

  // ── Get all EMD records ───────────────────────────────────────────────────
  static async getAllEmds() {
    return await EmdModel.find();
  }

  // ── Update entire EMD record ──────────────────────────────────────────────
  static async updateEmdRecord(tender_id, updateData) {
    const tender = await TenderModel.findOne({ tender_id });
    if (!tender) throw new Error("Tender record not found for the specified Tender ID.");

    // Recalculate emd_amount for every proposal using tender's emd_percentage
    if (updateData.proposals) {
      updateData.proposals = updateData.proposals.map((p) => ({
        ...p,
        emd_percentage: tender.emd?.emd_percentage ?? p.emd_percentage,
        emd_amount: p.proposed_amount && tender.emd?.emd_percentage
          ? (p.proposed_amount * tender.emd.emd_percentage) / 100
          : p.emd_amount,
      }));
    }

    return await EmdModel.findOneAndUpdate(
      { tender_id },
      { $set: updateData },
      { new: true }
    );
  }

  // ── Update a specific proposal by proposal_id ─────────────────────────────
  static async updateProposalInTender(tender_id, proposal_id, updateData) {
    const tender = await TenderModel.findOne({ tender_id });
    if (!tender) throw new Error("Tender record not found for the specified Tender ID.");

    const emdRecord = await EmdModel.findOne({ tender_id });
    if (!emdRecord) throw new Error("EMD record not found for this tender.");

    const index = emdRecord.proposals.findIndex((p) => p.proposal_id === proposal_id);
    if (index === -1) throw new Error("EMD proposal not found for the specified Proposal ID.");

    // Recalculate emd_amount if proposed_amount changed
    if (updateData.proposed_amount && tender.emd?.emd_percentage) {
      updateData.emd_percentage = tender.emd.emd_percentage;
      updateData.emd_amount = (updateData.proposed_amount * tender.emd.emd_percentage) / 100;
    }

    // Merge update data into existing proposal
    const existing = emdRecord.proposals[index].toObject
      ? emdRecord.proposals[index].toObject()
      : { ...emdRecord.proposals[index] };

    emdRecord.proposals[index] = { ...existing, ...updateData, proposal_id };

    // Re-rank all proposals after the amount may have changed
    emdRecord.proposals = assignLevels(
      emdRecord.proposals.map((p) => (p.toObject ? p.toObject() : p))
    );

    return await emdRecord.save();
  }

  // ── Remove a proposal ─────────────────────────────────────────────────────
  static async removeProposalFromTender(tender_id, proposal_id) {
    const emd = await EmdModel.findOne({ tender_id });
    if (!emd) throw new Error("EMD record not found for this tender.");
    const exists = emd.proposals.some((p) => p.proposal_id === proposal_id);
    if (!exists) throw new Error("EMD proposal not found for the specified Proposal ID.");
    return await EmdModel.updateOne(
      { tender_id },
      { $pull: { proposals: { proposal_id } } }
    );
  }

  // ── Delete entire EMD record ──────────────────────────────────────────────
  static async deleteEmdRecord(tender_id) {
    return await EmdModel.findOneAndDelete({ tender_id });
  }

  // ── Paginated proposals for a tender ─────────────────────────────────────
  static async getProposalsPaginated(tender_id, page = 1, limit = 10, search = "") {
    const emd = await EmdModel.findOne({ tender_id }, { proposals: 1, _id: 0 }).lean();

    if (!emd || !emd.proposals) {
      return { total: 0, proposals: [] };
    }

    let proposals = emd.proposals;

    if (search) {
      const regex = new RegExp(search, "i");
      proposals = proposals.filter(
        (p) =>
          regex.test(p.company_name || "") ||
          regex.test(p.proposal_id || "") ||
          regex.test(p.status || "") ||
          regex.test(String(p.proposed_amount || ""))
      );
    }

    const total = proposals.length;
    const startIndex = (page - 1) * limit;
    const paginatedProposals = proposals.slice(startIndex, startIndex + limit);

    return { total, proposals: paginatedProposals };
  }

  // ── Reject a single proposal ──────────────────────────────────────────────
  // Only the specified proposal is rejected.
  // If that proposal was previously APPROVED, Tender.emd.approved_emd_details is cleared.
  static async rejectProposal(tender_id, proposal_id, rejection_reason = "") {
    const emd = await EmdModel.findOne({ tender_id });
    if (!emd) throw new Error("EMD record not found for this tender.");

    const proposal = emd.proposals.find((p) => p.proposal_id === proposal_id);
    if (!proposal) throw new Error("EMD proposal not found for the specified Proposal ID.");

    const wasApproved = proposal.status === "APPROVED";

    proposal.status           = "REJECTED";
    proposal.rejection_reason = rejection_reason;
    proposal.rejected_date    = new Date();

    await emd.save();

    // If this proposal was the approved one, clear the Tender snapshot
    if (wasApproved) {
      await TenderModel.updateOne(
        { tender_id },
        {
          $set: {
            "emd.approved_emd_details": {
              emd_approved:              false,
              emd_tracking:              [],
              security_deposit_tracking: [],
            },
          },
        }
      );
    }

    return emd;
  }
static async updateProposalWithApprovalRule(tender_id, proposal_id, status, security_deposit, updatedBy) {
  const now = new Date();
  const targetTenderId = String(tender_id);
  const targetProposalId = String(proposal_id);

  // 1. FETCH DOCUMENT
  const emdDoc = await EmdModel.findOne({ tender_id: targetTenderId });
  if (!emdDoc) {
    throw new Error(`No Earnest Money Deposit record found for Tender ID ${targetTenderId}.`);
  }

  const currentProposal = emdDoc.proposals.find(p => p.proposal_id === targetProposalId);
  if (!currentProposal) {
    throw new Error("The specified Proposal ID does not exist in this tender's EMD record.");
  }

  const previousStatus = currentProposal.status;


  if (status === "APPROVED") {
    // 2. ATOMIC UPDATE
    const updateResult = await EmdModel.updateOne(
      { tender_id: targetTenderId },
      {
        $set: {
          "proposals.$[approved].status": "APPROVED",
          "proposals.$[approved].approved_by": updatedBy,
          "proposals.$[approved].approved_date": now,
          "proposals.$[approved].rejection_reason": "",
          "proposals.$[approved].rejected_date": null,
          "proposals.$[others].status": "REJECTED",
          "proposals.$[others].rejected_date": now,
          "proposals.$[others].rejection_reason": "L1 bidder selected; remaining proposals have been automatically rejected as per evaluation criteria."
        }
      },
      {
        arrayFilters: [
          { "approved.proposal_id": targetProposalId },
          { "others.proposal_id": { $ne: targetProposalId } }
        ]
      }
    );

    // 3. SYNC TO TENDER
    const sdAmount = Number(security_deposit?.security_deposit_amount) || 0;
    
    try {
      const tenderSync = await TenderModel.updateOne(
        { tender_id: targetTenderId },
        { 
          $set: { 
            "emd.approved_emd_details": {
              emd_proposed_company: currentProposal.company_name,
              emd_proposed_amount: currentProposal.proposed_amount,
              emd_proposed_date: currentProposal.payment_date,
              emd_approved: true,
              emd_approved_date: now,
              emd_approved_by: updatedBy,
              emd_approved_amount: currentProposal.emd_amount,
              emd_approved_status: "APPROVED",
              emd_applied_bank: currentProposal.payment_bank || "",
              emd_level: currentProposal.level || "",
              security_deposit_amount: sdAmount,
              security_deposit_validity: security_deposit?.security_deposit_validity || null,
              emd_tracking: [],
              security_deposit_tracking: []
            } 
          } 
        }
      );
    } catch (tenderErr) {
      throw new Error("Failed to sync approved EMD details to the Tender record. Please contact the system administrator.");
    }

  } else {
    // 4. REJECTION LOGIC
    const simpleUpdate = await EmdModel.updateOne(
      { tender_id: targetTenderId, "proposals.proposal_id": targetProposalId },
      { 
        $set: { 
          "proposals.$.status": status,
          "proposals.$.rejected_date": status === "REJECTED" ? now : null,
          "proposals.$.rejection_reason": status === "REJECTED" ? "Proposal rejected manually by the authorized approver." : ""
        } 
      }
    );

    if (previousStatus === "APPROVED") {
      await TenderModel.updateOne(
        { tender_id: targetTenderId },
        { $set: { "emd.approved_emd_details.emd_approved": false } }
      );
    }
  }

  return await EmdModel.findOne({ tender_id: targetTenderId });
}

}

export default EmdService;
