import TenderModel from "./tender.model.js";
import TenderService from "./tender.service.js";

export const createTender = async (req, res) => {
  try {
    const tender = await TenderService.createTender(req.body);
    res
      .status(201)
      .json({ status: true, message: "Tender created successfully", data: tender });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

export const getAllTenders = async (req, res) => {
  try {
    const tenders = await TenderService.getAllTenders();
    res.status(200).json({ status: true, data: tenders });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

export const getTenderById = async (req, res) => {
  try {
    const tender = await TenderService.getTenderById(req.params.tender_id);
    if (!tender)
      return res
        .status(404)
        .json({ status: false, message: "Tender not found" });

    res.status(200).json({ status: true, data: tender });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

export const getTenderByIdforApprove = async (req, res) => {
  try {
    const tender = await TenderService.getTenderByIdforApprove(req.params.tender_id);
    if (!tender)
      return res
        .status(404)
        .json({ status: false, message: "Tender not found" });

    res.status(200).json({ status: true, data: tender });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

export const getTenderByIdemd = async (req, res) => {
  try {
    const tender = await TenderService.getTenderByIdemd(req.params.tender_id);
    if (!tender)
      return res
        .status(404)
        .json({ status: false, message: "Tender not found" });

    res.status(200).json({ status: true, data: tender });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

export const updateTender = async (req, res) => {
  try {
    const tender = await TenderService.updateTender(
      req.params.tender_id,
      req.body
    );
    if (!tender)
      return res
        .status(404)
        .json({ status: false, message: "Tender not found" });

    res
      .status(200)
      .json({ status: true, message: "Tender updated successfully", data: tender });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

export const deleteTender = async (req, res) => {
  try {
    const tender = await TenderService.deleteTender(req.params.tender_id);
    if (!tender)
      return res
        .status(404)
        .json({ status: false, message: "Tender not found" });

    res
      .status(200)
      .json({ status: true, message: "Tender deleted successfully" });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// Separate API for tender_status_check
export const updateTenderStatusCheck = async (req, res) => {
  try {
    const tender = await TenderService.updateTenderStatusCheck(
      req.params.tender_id,
      req.body
    );
    if (!tender)
      return res
        .status(404)
        .json({ status: false, message: "Tender not found" });

    res.status(200).json({
      status: true,
      message: "Tender status check updated",
      data: tender,
    });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};


export const getTendersPaginated = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || "";
    const fromdate = req.query.fromdate || null;
    const todate = req.query.todate || null;

    const data = await TenderService.getTendersPaginated(
      page,
      limit,
      search,
      fromdate,
      todate
    );

    res.status(200).json({
      status: true,
      currentPage: page,
      totalPages: Math.ceil(data.total / limit),
      totalRecords: data.total,
      data: data.tenders
    });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};
// tender.controller.js
export const getTenderForOverview = async (req, res) => {
  try {
    const data = await TenderService.getTenderForOverview(req.params.tender_id);
    if (!data)
      return res.status(404).json({ status: false, message: "Tender not found" });

    res.status(200).json({ status: true, data });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

export const addImportantDate = async (req, res) => {
  try {
    const tender = await TenderService.addImportantDate(
      req.params.tender_id,
      req.body 
    );
    if (!tender) {
      return res.status(404).json({ status: false, message: "Tender not found" });
    }
    res.status(200).json({
      status: true,
      message: "Important date added successfully",
      data: tender.important_dates
    });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};


export const updateTenderWorkOrderController = async (req, res) => {
  try {
    
   const { tender_id } = req.params;
    const { workOrder_id,workOrder_issued_by } = req.body;

    if (!tender_id || !workOrder_issued_by ||!workOrder_id) {
      return res.status(400).json({
        success: false,
        message: "tender_id and workOrder_issued_by are required"
      });
    }

    const updatedTender = await TenderService.updateTenderStatusWithWorkOrder(
      tender_id,
      workOrder_id,
      workOrder_issued_by
    );

    res.status(200).json({
      success: true,
      message: "Tender status updated & work order issued successfully",
      data: updatedTender
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};


export const checkTenderApprovalStatus = async (req, res) => {
  try {
    const { tender_id } = req.params;

    if (!tender_id) {
      return res.status(400).json({
        success: false,
        message: "tender_id is required",
      });
    }

    const tender = await TenderModel.findOne(
      { tender_id },
      { tender_status: 1, _id: 0 }
    );

    if (!tender) {
      return res.status(404).json({
        success: false,
        message: "Tender not found",
      });
    }

    const isApproved = tender.tender_status?.toUpperCase() === "APPROVED";

    return res.status(200).json({
      success: true,
      approved: isApproved, // ✅ true or false
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }

};

export const getTendersPaginatedWorkerOrder = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || "";
    const fromdate = req.query.fromdate || null;
    const todate = req.query.todate || null;

    const data = await TenderService.getTendersPaginatedWorkorder(
      page,
      limit,
      search,
      fromdate,
      todate
    );

    res.status(200).json({
      status: true,
      currentPage: page,
      totalPages: Math.ceil(data.total / limit),
      totalRecords: data.total,
      data: data.tenders
    });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

export const getTendersPaginatedEMDSD = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || "";
    const fromdate = req.query.fromdate || null;
    const todate = req.query.todate || null;

    const data = await TenderService.getTendersPaginatedEMDSD(
      page,
      limit,
      search,
      fromdate,
      todate
    );

    res.status(200).json({
      status: true,
      currentPage: page,
      totalPages: Math.ceil(data.total / limit),
      totalRecords: data.total,
      data: data.tenders
    });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};