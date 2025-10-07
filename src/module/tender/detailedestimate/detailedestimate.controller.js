import detailedestimateService from "./detailedestimate.service.js";

export const detailedEstimateCustomHeading = async (req, res) => {
  try {
    const tender_id = req.query;
    const result = await detailedestimateService.createDetailedEstimateCustomHeadings(tender_id,req.body);
    res.status(200).json({ status: true, message: "Custom heading added successfully", data: result });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

export const extractHeadingInpairs = async(req,res)=>{
    try {
        const tender_id = req.query;
        const result = await detailedestimateService.extractHeadingsInPairs(tender_id);
        res.status(200).json({ status: true, message: "Custom heading pairs extracted successfully", data: result });
    } catch (error) {
        res.status(500).json({ status: false, message: error.message });
    }
}

export const bulkInsertCustomHeadingsController = async (req, res) => {
  try {
    const { tender_id } = req.query;
    const {nametype} = req.body;
    if (!req.file)
      return res.status(400).json({ status: false, message: "CSV file is required" });

    const result = await detailedestimateService.bulkInsertCustomHeadings(tender_id,nametype, req.file.path);

    // Optionally delete file after processing

    res.status(200).json({ status: true, message: "Bulk insert successful", data: result });
  } catch (err) {
    res.status(500).json({ status: false, message: err.message || "Error processing request" });
  }
};
