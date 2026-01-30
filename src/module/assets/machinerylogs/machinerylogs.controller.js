import MachineLogService from "./machinerylogs.service.js";


export const createBulkLogs = async (req, res) => {
  try {
    const logs = req.body.logs;
    const userId = req.user?._id || null;

    if (!logs || !Array.isArray(logs)) {
      return res.status(400).json({ 
        status: false,
        message: "Invalid format. 'logs' must be an array." 
      });
    }

    const createdLogs = await MachineLogService.bulkCreateLogs(logs, userId);

    return res.status(201).json({
      status: true,
      message: `${createdLogs.length} logs created successfully`,
      data: createdLogs,
    });
  } catch (error) {
    console.error("Bulk Create Error:", error);
    return res.status(500).json({
      status: false,
      message: error.message || "Internal Server Error",
    });
  }
};

export const getProjectLogs = async (req, res) => {
  try {
    // 1. Extract projectId from URL params (e.g., /machinerylogs/project/TND023)
    const { projectId } = req.params;
    
    // 2. Extract optional filters from Query String (e.g., ?startDate=...&assetName=...)
    const { startDate, endDate, assetName } = req.query;

    // 3. Combine them into one filter object for the Service
    const filters = {
      projectId,
      startDate,
      endDate,
      assetName
    };

    // 4. Call the updated Service method
    const data = await MachineLogService.getAllLogs(filters);

    return res.status(200).json({
      status: true,
      data,
    });
  } catch (error) {
    return res.status(500).json({ status: false, message: error.message });
  }
};

export const getAllLogs = async (req, res) => {
  try {
    const filters = {
      projectId: req.query.projectId,
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      assetName: req.query.assetName,
    };

    const data = await MachineLogService.getAllLogs(filters);

    return res.status(200).json({
      status: true,
      count: data.length,
      data,
    });
  } catch (error) {
    console.error("Error fetching logs:", error);
    return res.status(500).json({ status: false, message: error.message });
  }
};
