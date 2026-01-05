import WorkDoneService from "./workdone.service.js";


export const createWorkDone = async (req, res) => {
  try {
    const workDoneData = req.body;

    const workDone = await WorkDoneService.createWorkDone(workDoneData);
    res.status(201).json({ success: true, data: workDone });
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

    const reports = await WorkDoneService.getAllWorkDoneByTender(tender_id);
    
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
    
    const report = await WorkDoneService.getWorkDoneSpecific(tender_id, workDoneId);
    
    res.status(200).json({ 
      success: true, 
      data: report 
    });
  } catch (error) {
    res.status(404).json({ success: false, error: error.message });
  }
};
