import TenderModel from "../tender/tender.model.js";
import EmdModel from "./emd.model.js";


class EmdService {
  // Create new EMD record for a tender
 static async addProposalToTender(tender_id, proposal, created_by_user = null) {
  const tender = await TenderModel.findOne({ tender_id });
  if (!tender) throw new Error("Tender not found");
  if (!tender.emd?.emd_percentage) throw new Error("Tender does not have emd_percentage set");

  proposal.emd_percentage = tender.emd.emd_percentage;
  proposal.emd_amount = (proposal.proposed_amount * tender.emd.emd_percentage) / 100;
  proposal.emd_validity = tender.emd.emd_validity; // if you store this too

  let emdRecord = await EmdModel.findOne({ tender_id });

  if (!emdRecord) {
    emdRecord = new EmdModel({
      tender_id,
      proposals: [proposal],
      created_by_user
    });
    return await emdRecord.save();
  } else {
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
      updateData.proposals = updateData.proposals.map(p => ({
        ...p,
        emd_percentage: tender.emd.emd_percentage,
        emd_amount: (p.proposed_amount * tender.emd_percentage) / 100
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
      updateData.emd_amount = (updateData.proposed_amount * tender.emd_percentage) / 100;
    }

    return await EmdModel.updateOne(
      { tender_id, "proposals.company_name": company_name },
      { $set: { "proposals.$": { company_name, ...updateData } } }
    );
  }

  // Remove a proposal
  static async removeProposalFromTender(tender_id, company_name) {
    return await EmdModel.updateOne(
      { tender_id },
      { $pull: { proposals: { company_name } } }
    );
  }

  // Delete entire record
  static async deleteEmdRecord(tender_id) {
    return await EmdModel.findOneAndDelete({ tender_id });
  }

    static async approveProposal(tender_id, company_name, approvalData) {
    // ✅ Update proposal in EMD
    const emdRecord = await EmdModel.findOneAndUpdate(
      { tender_id, "proposals.company_name": company_name },
      {
        $set: { "proposals.$": { ...approvalData, company_name } }
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
      security_deposit_approved_by: approvalData.security_deposit_approved_by || "",
      security_deposit_approved_date: approvalData.security_deposit_approved_date || null,
      security_deposit_amount_collected: approvalData.security_deposit_amount_collected || 0,
      security_deposit_pendingAmount:
        (approvalData.security_deposit_amount || 0) -
        (approvalData.security_deposit_amount_collected || 0),
      security_deposit_note: approvalData.security_deposit_note || ""
    };

    // ✅ Push into Tender.approved_emd_details
    await TenderModel.updateOne(
      { tender_id },
      { $push: { "emd.approved_emd_details": approvedEntry } }
    );

    return emdRecord;
  }
}

export default EmdService;
