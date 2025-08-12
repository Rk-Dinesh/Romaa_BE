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
      message: "Proposal added to tender successfully",
      data: result
    });
  } catch (error) {
    res.status(500).json({
      status: false,
      message: error.message
    });
  }
};

// 📄 Get EMD record by tender_id
export const getEmdByTender = async (req, res) => {
  try {
    const { tender_id } = req.params;
    const result = await EmdService.getEmdByTender(tender_id);

    if (!result) {
      return res.status(404).json({
        status: false,
        message: "EMD record not found"
      });
    }

    res.status(200).json({ status: true, data: result });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// 📄 Get all EMD records
export const getAllEmds = async (req, res) => {
  try {
    const result = await EmdService.getAllEmds();
    res.status(200).json({ status: true, data: result });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// ✏ Update entire EMD record for a tender
export const updateEmdRecord = async (req, res) => {
  try {
    const { tender_id } = req.params;
    const updateData = req.body;

    const result = await EmdService.updateEmdRecord(tender_id, updateData);

    res.status(200).json({
      status: true,
      message: "EMD record updated successfully",
      data: result
    });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// ✏ Update a specific proposal in tender
export const updateProposalInTender = async (req, res) => {
  try {
    const { tender_id, company_name } = req.params;
    const updateData = req.body;

    const result = await EmdService.updateProposalInTender(
      tender_id,
      company_name,
      updateData
    );

    res.status(200).json({
      status: true,
      message: "Proposal updated successfully",
      data: result
    });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

export const removeProposalFromTender = async (req, res) => {
  try {
    const { tender_id, company_name } = req.params;

    const result = await EmdService.removeProposalFromTender(
      tender_id,
      company_name
    );

    res.status(200).json({
      status: true,
      message: "Proposal removed successfully",
      data: result
    });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};


export const deleteEmdRecord = async (req, res) => {
  try {
    const { tender_id } = req.params;

    const result = await EmdService.deleteEmdRecord(tender_id);

    res.status(200).json({
      status: true,
      message: "EMD record deleted successfully",
      data: result
    });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};
