import SampleDataService from "./sampledata.service.js";

const WIPE_PHRASE = "WIPE-SAMPLE-DATA";

export const seedSampleData = async (req, res) => {
  try {
    const result = await SampleDataService.seedAll(req.user?._id);
    res.status(201).json({ status: true, message: "Sample data loaded", data: result });
  } catch (err) {
    res.status(err.statusCode || 500).json({ status: false, message: err.message });
  }
};

export const wipeSampleData = async (req, res) => {
  try {
    if (req.body?.confirm !== WIPE_PHRASE) {
      return res.status(400).json({
        status: false,
        message: `Confirmation required. Send body { "confirm": "${WIPE_PHRASE}" } to proceed.`,
      });
    }
    const result = await SampleDataService.wipeAll(req.user?._id);
    res.status(200).json({
      status: true,
      message: result.wiped ? "Sample data wiped" : "No sample data to wipe",
      data: result,
    });
  } catch (err) {
    res.status(err.statusCode || 500).json({ status: false, message: err.message });
  }
};

export const getSampleDataStatus = async (_req, res) => {
  try {
    const result = await SampleDataService.getStatus();
    res.status(200).json({ status: true, data: result });
  } catch (err) {
    res.status(500).json({ status: false, message: err.message });
  }
};
