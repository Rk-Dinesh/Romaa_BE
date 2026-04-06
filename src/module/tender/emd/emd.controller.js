import EmdService from "./emd.service.js";


export const addProposalToTender = async (req, res) => {
  try {
    const { tender_id } = req.params;
    const proposal = req.body;
    const { created_by_user } = req.body; // optional

    const result = await EmdService.addProposalToTender(
      tender_id,
      proposal,
      created_by_user
    );

    res.status(201).json({
      status: true,
      message: "EMD proposal submitted successfully.",
      data: result
    });
  } catch (error) {
    const code = error.message.includes("not found") ? 404 : 400;
    res.status(code).json({
      status: false,
      message: error.message
    });
  }
};

// Get EMD record by tender_id
export const getEmdByTender = async (req, res) => {
  try {
    const { tender_id } = req.params;
    const result = await EmdService.getEmdByTender(tender_id);

    if (!result) {
      return res.status(404).json({
        status: false,
        message: "No Earnest Money Deposit record found for this tender."
      });
    }

    res.status(200).json({ status: true, data: result });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// Get all EMD records
export const getAllEmds = async (req, res) => {
  try {
    const result = await EmdService.getAllEmds();
    res.status(200).json({ status: true, data: result });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// Update entire EMD record for a tender
export const updateEmdRecord = async (req, res) => {
  try {
    const { tender_id } = req.params;
    const updateData = req.body;

    const result = await EmdService.updateEmdRecord(tender_id, updateData);

    res.status(200).json({
      status: true,
      message: "Earnest Money Deposit record updated successfully.",
      data: result
    });
  } catch (error) {
    const code = error.message.includes("not found") ? 404 : 400;
    res.status(code).json({ status: false, message: error.message });
  }
};

// Update a specific proposal in tender (by proposal_id)
export const updateProposalInTender = async (req, res) => {
  try {
    const { tender_id, proposal_id } = req.params;
    const updateData = req.body;

    const result = await EmdService.updateProposalInTender(
      tender_id,
      proposal_id,
      updateData
    );

    res.status(200).json({
      status: true,
      message: "EMD proposal updated successfully.",
      data: result
    });
  } catch (error) {
    const code = error.message.includes("not found") ? 404 : 400;
    res.status(code).json({ status: false, message: error.message });
  }
};

export const removeProposalFromTender = async (req, res) => {
  try {
    const { tender_id, proposal_id } = req.params;

    const result = await EmdService.removeProposalFromTender(
      tender_id,
      proposal_id
    );

    res.status(200).json({
      status: true,
      message: "EMD proposal removed successfully.",
      data: result
    });
  } catch (error) {
    const code = error.message.includes("not found") ? 404 : 400;
    res.status(code).json({ status: false, message: error.message });
  }
};


export const deleteEmdRecord = async (req, res) => {
  try {
    const { tender_id } = req.params;

    const result = await EmdService.deleteEmdRecord(tender_id);
    if (!result) {
      return res.status(404).json({ status: false, message: "No Earnest Money Deposit record found for this tender. Deletion could not be completed." });
    }

    res.status(200).json({
      status: true,
      message: "Earnest Money Deposit record deleted successfully.",
      data: result
    });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};
export const getProposalsPaginated = async (req, res) => {
  try {
    const { tender_id } = req.params;
    const { page = 1, limit = 10, search = "" } = req.query;

    const result = await EmdService.getProposalsPaginated(
      tender_id,
      parseInt(page),
      parseInt(limit),
      search
    );

    res.json({
      status: true,
      total: result.total,
      data: result.proposals
    });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

export const rejectProposal = async (req, res) => {
  try {
    const { tender_id, proposal_id } = req.params;
    const { rejection_reason = "" } = req.body;

    const result = await EmdService.rejectProposal(tender_id, proposal_id, rejection_reason);

    res.status(200).json({
      status: true,
      message: "EMD proposal rejected successfully.",
      data: result,
    });
  } catch (error) {
    const code = error.message.includes("not found") ? 404 : 400;
    res.status(code).json({ status: false, message: error.message });
  }
};

export const updateProposalWithApprovalRule = async (req, res) => {
  try {
    const { tender_id, proposal_id } = req.params;
    const { status, security_deposit } = req.body;

    const updatedBy = req.user?.name || "System";

    const result = await EmdService.updateProposalWithApprovalRule(
      tender_id,
      proposal_id,
      status,
      security_deposit,
      updatedBy
    );

    res.json({
      status: true,
      message: "EMD proposal approval status updated successfully.",
      data: result,
    });
  } catch (error) {
    const code = error.message.includes("not found") || error.message.includes("No tender") ? 404 : 400;
    res.status(code).json({ status: false, message: error.message });
  }
};
