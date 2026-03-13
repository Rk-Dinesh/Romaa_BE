import WorkOrderDoneService from "./workorderdone.service.js";


export const createWorkDone = async (req, res) => {
  try {
    const workDoneData = req.body;

    const workDone = await WorkOrderDoneService.createWorkDone(workDoneData);
    res.status(201).json({ success: true, data: workDone });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const bulkCreateWorkDone = async (req, res) => {
  try {
    const payloads = req.body;

    if (!Array.isArray(payloads)) {
      return res.status(400).json({ success: false, error: "Request body must be an array of work done payloads" });
    }

    const result = await WorkOrderDoneService.bulkCreateWorkDone(payloads);
    res.status(201).json({ success: true, count: result.length, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getAllWorkDoneByTender = async (req, res) => {
  try {
    const { tender_id } = req.params;
    
    if (!tender_id) {
        return res.status(400).json({ success: false, error: "Tender ID is required" });
    }

    const reports = await WorkOrderDoneService.getAllWorkDoneByTender(tender_id);
    
    res.status(200).json({ 
      success: true, 
      count: reports.length, 
      data: reports 
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getWorkDoneSpecific = async (req, res) => {
  try {
    const { tender_id, workDoneId } = req.params;
    
    const report = await WorkOrderDoneService.getWorkDoneSpecific(tender_id, workDoneId);
    
    res.status(200).json({ 
      success: true, 
      data: report 
    });
  } catch (error) {
    res.status(404).json({ success: false, error: error.message });
  }
};

export const getWorkDoneSummaryByDate = async (req, res) => {
  try {
    const { tender_id } = req.params;
    const summary = await WorkOrderDoneService.getWorkDoneSummaryByDate(tender_id);
    res.status(200).json({ success: true, count: summary.length, data: summary });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getWorkDoneReportDate = async (req, res) => {
  try {
    const { tender_id, report_date } = req.params;
    
    const report = await WorkOrderDoneService.getWorkDoneReportDate(tender_id, report_date);
    
    res.status(200).json({ 
      success: true, 
      data: report 
    });
  } catch (error) {
    res.status(404).json({ success: false, error: error.message });
  }
};

