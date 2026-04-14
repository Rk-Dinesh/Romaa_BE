import WorkOrderDoneService from "./workorderdone.service.js";


export const createWorkDone = async (req, res) => {
  try {
    const workDoneData = req.body;

    const workDone = await WorkOrderDoneService.createWorkDone(workDoneData);
    res.status(201).json({ status: true, data: workDone });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

export const bulkCreateWorkDone = async (req, res) => {
  try {
    const payloads = req.body;

    if (!Array.isArray(payloads)) {
      return res.status(400).json({ status: false, message: "Request body must be an array of work order done entries" });
    }

    const result = await WorkOrderDoneService.bulkCreateWorkDone(payloads);
    res.status(201).json({ status: true, count: result.length, data: result });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

export const getAllWorkDoneByTender = async (req, res) => {
  try {
    const { tender_id } = req.params;

    if (!tender_id) {
      return res.status(400).json({ status: false, message: "Tender ID is required to retrieve work order done records" });
    }

    const { page, limit, search } = req.query;
    const fromdate = req.query.fromdate || null;
    const todate   = req.query.todate   || null;
    const result = await WorkOrderDoneService.getAllWorkDoneByTender(tender_id, { fromdate, todate, page, limit, search });

    res.status(200).json({
      status: true,
      currentPage: result.page,
      totalPages: Math.ceil(result.total / result.limit),
      totalCount: result.total,
      data: result.data,
    });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

export const getWorkDoneSpecific = async (req, res) => {
  try {
    const { tender_id, workDoneId } = req.params;
    
    const report = await WorkOrderDoneService.getWorkDoneSpecific(tender_id, workDoneId);
    
    res.status(200).json({ 
      status: true, 
      data: report 
    });
  } catch (error) {
    res.status(404).json({ status: false, message: error.message });
  }
};

export const getWorkDoneSummaryByDate = async (req, res) => {
  try {
    const { tender_id } = req.params;
    const summary = await WorkOrderDoneService.getWorkDoneSummaryByDate(tender_id);
    res.status(200).json({ status: true, count: summary.length, data: summary });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

export const getWorkDoneReportDate = async (req, res) => {
  try {
    const { tender_id, report_date } = req.params;
    
    const report = await WorkOrderDoneService.getWorkDoneReportDate(tender_id, report_date);
    
    res.status(200).json({ 
      status: true, 
      data: report 
    });
  } catch (error) {
    res.status(404).json({ status: false, message: error.message });
  }
};

