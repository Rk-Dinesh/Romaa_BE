import IdcodeServices from "../../idcode/idcode.service.js";
import TenderModel from "../tender/tender.model.js";
import EmdModel from "./emd.model.js";

class EmdService {
  // Create new EMD record for a tender
  static async addProposalToTender(
    tender_id,
    proposal,
    created_by_user = null
  ) {
    if (!tender_id) throw new Error("tender_id is required");

    // 🔹 Find tender first
    const tender = await TenderModel.findOne({ tender_id });
    if (!tender) throw new Error("Tender not found");
    if (!tender.emd?.emd_percentage)
      throw new Error("Tender does not have emd_percentage set");

    // Fill calculated fields
    proposal.emd_percentage = tender.emd.emd_percentage;
    proposal.emd_amount =
      (proposal.proposed_amount * tender.emd.emd_percentage) / 100;
    proposal.emd_validity = tender.emd.emd_validity;

    // 🔹 Generate unique Proposal ID
    const proposalIdName = "PROPOSAL";
    const proposalIdCode = "PRO";
    await IdcodeServices.addIdCode(proposalIdName, proposalIdCode);
    proposal.proposal_id = await IdcodeServices.generateCode(proposalIdName);

    // 🔹 Check if EMD record already exists
    let emdRecord = await EmdModel.findOne({ tender_id });

    if (!emdRecord) {
      // Generate unique EMD ID
      const emdIdName = "EMD";
      const emdIdCode = "EMD";
      await IdcodeServices.addIdCode(emdIdName, emdIdCode);
      const emd_id = await IdcodeServices.generateCode(emdIdName);
      if (!emd_id) throw new Error("Failed to generate EMD ID");

      // Create new record with first proposal
      emdRecord = new EmdModel({
        tender_id,
        emd_id,
        proposals: [proposal],
        created_by_user,
      });

      return await emdRecord.save();
    } else {
      // Append new proposal
      emdRecord.proposals.push(proposal);
      return await emdRecord.save();
    }
  }

  // Get EMD record by tender_id
  static async getEmdByTender(tender_id) {
    return await EmdModel.findOne({ tender_id });
  }

  // Get all
  static async getAllEmds() {
    return await EmdModel.find();
  }

  // Update entire EMD record (recalculate using tender's % if proposed_amount changes)
  static async updateEmdRecord(tender_id, updateData) {
    const tender = await TenderModel.findOne({ tender_id });
    if (!tender) throw new Error("Tender not found");

    if (updateData.proposals) {
      updateData.proposals = updateData.proposals.map((p) => ({
        ...p,
        emd_percentage: tender.emd.emd_percentage,
        emd_amount: (p.proposed_amount * tender.emd_percentage) / 100,
      }));
    }

    return await EmdModel.findOneAndUpdate(
      { tender_id },
      { $set: updateData },
      { new: true }
    );
  }

  // Update a specific proposal
  static async updateProposalInTender(tender_id, company_name, updateData) {
    const tender = await TenderModel.findOne({ tender_id });
    if (!tender) throw new Error("Tender not found");

    if (updateData.proposed_amount) {
      updateData.emd_percentage = tender.emd_percentage;
      updateData.emd_amount =
        (updateData.proposed_amount * tender.emd_percentage) / 100;
    }

    return await EmdModel.updateOne(
      { tender_id, "proposals.company_name": company_name },
      { $set: { "proposals.$": { company_name, ...updateData } } }
    );
  }

  // Remove a proposal
  static async removeProposalFromTender(tender_id, proposal_id) {
    return await EmdModel.updateOne(
      { tender_id },
      { $pull: { proposals: { proposal_id } } }
    );
  }

  // Delete entire record
  static async deleteEmdRecord(tender_id) {
    return await EmdModel.findOneAndDelete({ tender_id });
  }

  static async approveProposal(tender_id, proposal_id, approvalData) {
    // ✅ Update proposal in EMD
    const emdRecord = await EmdModel.findOneAndUpdate(
      { tender_id, "proposals.proposal_id": proposal_id },
      {
        $set: { "proposals.$": { ...approvalData, proposal_id } },
      },
      { new: true }
    );

    if (!emdRecord) throw new Error("EMD record not found");

    // ✅ Prepare approved EMD entry for Tender
    const approvedEntry = {
      emd_proposed_company: company_name,
      emd_proposed_amount: approvalData.proposed_amount || 0,
      emd_proposed_date: approvalData.proposed_date || new Date(),
      emd_approved: true,
      emd_approved_date: approvalData.emd_approved_date || new Date(),
      emd_approved_by: approvalData.emd_approved_by || "",
      emd_approved_amount: approvalData.emd_approved_amount || 0,
      emd_approved_status: approvalData.emd_approved_status || "APPROVED",
      emd_applied_bank: approvalData.emd_applied_bank || "",
      emd_applied_bank_branch: approvalData.emd_applied_bank_branch || "",
      emd_level: approvalData.emd_level || "",
      emd_note: approvalData.emd_note || "",
      security_deposit_amount: approvalData.security_deposit_amount || 0,
      security_deposit_validity: approvalData.security_deposit_validity || null,
      security_deposit_status: approvalData.security_deposit_status || "",
      security_deposit_approved_by:
        approvalData.security_deposit_approved_by || "",
      security_deposit_approved_date:
        approvalData.security_deposit_approved_date || null,
      security_deposit_amount_collected:
        approvalData.security_deposit_amount_collected || 0,
      security_deposit_pendingAmount:
        (approvalData.security_deposit_amount || 0) -
        (approvalData.security_deposit_amount_collected || 0),
      security_deposit_note: approvalData.security_deposit_note || "",
    };

    // ✅ Push into Tender.approved_emd_details
    await TenderModel.updateOne(
      { tender_id },
      { $push: { "emd.approved_emd_details": approvedEntry } }
    );

    return emdRecord;
  }

  static async getProposalsPaginated(
    tender_id,
    page = 1,
    limit = 10,
    search = ""
  ) {
    // Step 1: Find only 'proposals' field
    const emd = await EmdModel.findOne(
      { tender_id },
      { proposals: 1, _id: 0 }
    ).lean();

    if (!emd || !emd.proposals) {
      return { total: 0, proposals: [] };
    }

    let proposals = emd.proposals;

    // Step 2: Optional search
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

    // Step 3: Pagination
    const total = proposals.length;
    const startIndex = (page - 1) * limit;
    const paginatedProposals = proposals.slice(startIndex, startIndex + limit);

    return {
      total,
      proposals: paginatedProposals,
    };
  }
  static async updateProposalWithApprovalRule(
    tender_id,
    proposal_id,
    status,
    level,
    security_deposit, // { security_deposit_percentage, security_deposit_validity }
    updatedBy
  ) {
    const emd = await EmdModel.findOne({ tender_id });
    if (!emd) throw new Error("Tender EMD not found");

    // Find current approved proposal & the one to update
    const approvedProposal = emd.proposals.find((p) => p.status === "APPROVED");
    const proposalToUpdate = emd.proposals.find(
      (p) => p.proposal_id === proposal_id
    );
    if (!proposalToUpdate) throw new Error("Proposal not found");

    // Only allow one APPROVED proposal
    if (
      status === "APPROVED" &&
      approvedProposal &&
      approvedProposal.proposal_id !== proposal_id
    ) {
      approvedProposal.status = "PENDING";
    }

    // Update the target proposal
    proposalToUpdate.status = status;
    if (level) proposalToUpdate.level = level;

    await emd.save();

    // If approving, calculate deposit & update Tender doc
    if (status === "APPROVED") {
      const emdAmount = proposalToUpdate.proposed_amount || 0;
      const depositPercentage =
        Number(security_deposit?.security_deposit_percentage) || 0;
      const depositAmount = (emdAmount * depositPercentage) / 100 || 0;

      const approvedEntry = {
        emd_proposed_company: proposalToUpdate.company_name || "",
        emd_proposed_amount: emdAmount,
        emd_proposed_date: proposalToUpdate.payment_date || new Date(),
        emd_approved: true,
        emd_approved_date: new Date(),
        emd_approved_by: updatedBy || "",
        emd_approved_amount: proposalToUpdate.emd_amount || 0,
        emd_approved_status: "APPROVED",
        emd_applied_bank: proposalToUpdate.payment_bank || "",
        emd_applied_bank_branch: "",
        emd_level: proposalToUpdate.level || "",
        emd_note: proposalToUpdate.notes || "",
        emd_deposit_amount_collected: 0,
        emd_deposit_pendingAmount: 0,

        // ✅ New calculation
        security_deposit_percentage: depositPercentage,
        security_deposit_amount: depositAmount,
        security_deposit_validity:
          security_deposit?.security_deposit_validity || null,
        security_deposit_status: "",
        security_deposit_approved_by: "",
        security_deposit_approved_date: null,
        security_deposit_amount_collected: 0,
        security_deposit_pendingAmount: 0,
        security_deposit_note: "",
      };

      // Remove any existing approved entries
      await TenderModel.updateOne(
        { tender_id },
        { $pull: { "emd.approved_emd_details": { emd_approved: true } } }
      );

      // Push new approved entry
      await TenderModel.updateOne(
        { tender_id },
        { $push: { "emd.approved_emd_details": approvedEntry } }
      );

      // ✅ Also update Tender.security_deposit schema directly
      await TenderModel.updateOne(
        { tender_id },
        {
          $set: {
            security_deposit: {
              security_deposit_percentage: depositPercentage,
              security_deposit_amount: depositAmount,
              security_deposit_validity:
                security_deposit?.security_deposit_validity || null,
            },
          },
        }
      );
    }

    return emd;
  }
}

export default EmdService;
