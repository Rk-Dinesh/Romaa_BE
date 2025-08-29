import { uploadFileToS3 } from "../../../../utils/helperfunction.js";
import TenderModel from "./tender.model.js";
import TenderService from "./tender.service.js";
import dotenv from "dotenv";
dotenv.config();

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
    const { workOrder_id,workOrder_issued_date } = req.body;

    if (!tender_id || !workOrder_issued_date ||!workOrder_id) {
      return res.status(400).json({
        success: false,
        message: "tender_id and workOrder_issued_by are required"
      });
    }

    const updatedTender = await TenderService.updateTenderStatusWithWorkOrder(
      tender_id,
      workOrder_id,
      workOrder_issued_date
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

export const updateEmdDetails = async (req, res) => {
  try {
    const { tender_id } = req.params; 
    const updatedEmd = await TenderService.updateEmdDetailsService(
      tender_id,
      req.body
    );

    res.json({
      message: "EMD details updated successfully",
      updatedEmd
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const updateSDDetails = async (req, res) => {
  try {
    const { tender_id } = req.params; 
    const updatedEmd = await TenderService.updateSDDetailsService(
      tender_id,
      req.body
    );

    res.json({
      message: "SD details updated successfully",
      updatedEmd
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const getWorkOrdererForOverview = async (req, res) => {
  try {
    const data = await TenderService.getWorkorderForOverview(req.params.tender_id);
    if (!data)
      return res.status(404).json({ status: false, message: "Tender not found" });

    res.status(200).json({ status: true, data });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

export const getTenderProcess = async (req, res) => {
  try {
    const processData = await TenderService.getTenderProcess(req.params.tender_id);
    res.status(200).json({ status: true, processData });
  } catch (err) {
    if (err.message === "Tender not found")
      return res.status(404).json({ status: false, message: err.message });
    res.status(500).json({ status: false, message: err.message });
  }
};


export const saveTenderProcessStep = async (req, res) => {
  try {
    const updatedProcess = await TenderService.saveTenderProcessStep(req.body.tender_id, req.body);
    res.status(200).json({ status: true, message: "Step saved", processData: updatedProcess });
  } catch (err) {
    if (err.message === "Tender not found" || err.message === "Step not found")
      return res.status(404).json({ status: false, message: err.message });
    res.status(500).json({ status: false, message: err.message });
  }
};


export const saveTenderProcessStepaws = async (req, res) => {
  const file = req.file; 
  const { tender_id, step_key, notes, date, time } = req.body;

  if (!tender_id || !step_key) {
    return res.status(400).json({ status: false, message: "tender_id and step_key are required" });
  }

  try {
    let file_name = "";
    let file_url = "";
    if (file) {
      // Upload file buffer to S3
      const uploadResult = await uploadFileToS3(file, process.env.AWS_S3_BUCKET);
       file_url = `https://${uploadResult.Bucket}.s3.${process.env.AWS_REGION}.amazonaws.com/${uploadResult.Key}`;

      file_name = uploadResult.Key; // Store the S3 object key
    }

    const stepData = {
      tender_id,
      step_key,
      notes,
      date,
      time,
      file_name,
      file_url
    };

    const updatedProcess = await TenderService.saveTenderProcessStepaws(tender_id, stepData);

    res.status(200).json({
      status: true,
      message: "Step saved",
      processData: updatedProcess,
    });
  } catch (err) {
    if (err.message === "Tender not found" || err.message === "Step not found")
      return res.status(404).json({ status: false, message: err.message });
    res.status(500).json({ status: false, message: err.message });
  }
};

export const getPreliminarySiteWork = async (req, res) => {
  try {
    const processData = await TenderService.getPreliminarySiteWork(req.params.tender_id);
    res.status(200).json({ status: true, processData });
  } catch (err) {
    if (err.message === "Tender not found")
      return res.status(404).json({ status: false, message: err.message });
    res.status(500).json({ status: false, message: err.message });
  }
};

export const savePreliminarySiteWork = async (req, res) => {
  try {
    const updatedWork = await TenderService.savePreliminarySiteWork(req.body.tender_id, req.body);
    res.status(200).json({ status: true, message: "Preliminary site work saved", processData: updatedWork });
  } catch (err) {
    if (err.message === "Tender not found" || err.message === "Work item not found")
      return res.status(404).json({ status: false, message: err.message });
    res.status(500).json({ status: false, message: err.message });
  }
};

export const savePreliminarySiteWorkaws = async (req, res) => {
  const file = req.file; 
  const { tender_id, step_key, notes, date, time } = req.body;

  if (!tender_id || !step_key) {
    return res.status(400).json({ status: false, message: "tender_id and step_key are required" });
  }

  try {
    let file_name = "";
    let file_url = "";
    if (file) {
      // Upload file buffer to S3
      const uploadResult = await uploadFileToS3(file, process.env.AWS_S3_BUCKET);
       file_url = `https://${uploadResult.Bucket}.s3.${process.env.AWS_REGION}.amazonaws.com/${uploadResult.Key}`;

      file_name = uploadResult.Key; // Store the S3 object key
    }

    const stepData = {
      tender_id,
      step_key,
      notes,
      date,
      time,
      file_name,
      file_url
    };

    const updatedProcess = await TenderService.savePreliminarySiteWorkaws(tender_id, stepData);

    res.status(200).json({
      status: true,
      message: "Preliminary site work saved",
      processData: updatedProcess,
    });
  } catch (err) {
    if (err.message === "Tender not found" || err.message === "Work item not found")
      return res.status(404).json({ status: false, message: err.message });
    res.status(500).json({ status: false, message: err.message });
  }
};

export const getFinancialGenerals = async (req, res) => {
  try {
    const data = await TenderService.getFinancialGenerals(req.params.tender_id,req.params.workOrder_id);
    if (!data)
      return res.status(404).json({ status: false, message: "Tender not found" });

    res.status(200).json({ status: true, data });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
}

export const updateFinancialGenerals = async (req, res) => {
  try {
    const { tender_id ,workOrder_id} = req.params; 
    const updatedFinancialGenerals = await TenderService.financialGeneralsUpdate(
      tender_id,
      workOrder_id,
      req.body
    );

    res.json({
      message: "Financial generals updated successfully",
      updatedFinancialGenerals
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
}

export const getTenderPenalityValue = async (req, res) => {
  try {
    const tenders = await TenderService.getTenderPenalityValue();
    res.status(200).json({ status: true, data: tenders });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
}

export const getGenerlSetup = async (req, res) => {
  try {
    const { tender_id } = req.params; 
    const generlSetup = await TenderService.getGeneralSetup(tender_id);
    if (!generlSetup)
      return res.status(404).json({ status: false, message: "Tender not found" });

    res.status(200).json({ status: true, data: generlSetup });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
}

export const updateGenerlSetup = async (req, res) => {
  try {
    const { tender_id } = req.params; 
    const updatedGenerlSetup = await TenderService.updateGenerlSetup(
      tender_id,
      req.body
    );

    res.json({
      message: "General setup updated successfully",
      updatedGenerlSetup
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
}
