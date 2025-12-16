import WorkItemService from './rateanalysis.service.js';
import csvParser from 'csv-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const addWorkItem = async (req, res) => {
  try {
    const result = await WorkItemService.addWorkItem(req.body);
    res.status(201).json({ status: true, message: 'WorkItem created', data: result });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

export const getAllWorkItems = async (req, res) => {
  try {
    const items = await WorkItemService.getAllWorkItems();
    res.status(200).json({ status: true, data: items });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

export const getWorkItemById = async (req, res) => {
  try {
    const item = await WorkItemService.getWorkItemById(req.params.id);
    // if (!item) return res.status(404).json({ status: false, message: 'WorkItem not found' });
    res.status(200).json({ status: true, data: item });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

export const getWorkItemsByTenderId = async (req, res) => {
  try {
    const { tenderId } = req.query;
    const item = await WorkItemService.getWorkItemsByTenderId(tenderId);
    // if (!item) return res.status(404).json({ status: false, message: 'WorkItems not found for this tender_id' });
    res.status(200).json({ status: true, data: item });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
}

export const updateWorkItem = async (req, res) => {
  try {
    const updated = await WorkItemService.updateWorkItem(req.params.id, req.body);
    res.status(200).json({ status: true, message: 'Updated successfully', data: updated });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

export const deleteWorkItem = async (req, res) => {
  try {
    const deleted = await WorkItemService.deleteWorkItem(req.params.id);
    res.status(200).json({ status: true, message: 'Deleted successfully', data: deleted });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};
export const uploadWorkItemsCSV1 = async (req, res, next) => {
  try {
    const { tender_id } = req.body;
    if (!tender_id) return res.status(400).json({ error: "tender_id is required" });

    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const csvRows = [];
    const filePath = path.join(process.cwd(), "uploads", req.file.filename);

    fs.createReadStream(filePath)
      .pipe(csvParser())
      .on("data", (row) => {
        csvRows.push(row);
      })
      .on("end", async () => {
        try {
          const result = await WorkItemService.bulkInsert1(csvRows, tender_id);
          res.status(200).json(result);
        } catch (e) {
          next(e);
        } finally {
          fs.unlinkSync(filePath);
        }
      });
  } catch (error) {
    next(error);
  }
};


export const uploadWorkItemsCSVAndSyncBoq = async (req, res) => {
  try {
    const { tender_id } = req.body;
    if (!tender_id) {
      return res.status(400).json({ error: "tender_id is required" });
    }
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const csvRows = [];
    const filePath = path.join(process.cwd(), "uploads", req.file.filename);

    fs.createReadStream(filePath)
      .pipe(csvParser())
      .on("data", (row) => {
        csvRows.push(row);
      })
      .on("end", async () => {
        try {
          const workItemsDoc =
            await WorkItemService.bulkInsertWorkItemsFromCsv(csvRows, tender_id);

          fs.unlinkSync(filePath);

          res.status(200).json({
            success: true,
            updatedWorkItems: workItemsDoc
          });
        } catch (error) {
          try {
            fs.unlinkSync(filePath);
          } catch (error) { }
          return res.status(400).json({ status: false, message: error.message });
        }
      })
      .on("error", (err) => {
        try {
          fs.unlinkSync(filePath);
        } catch { }
        return res.status(400).json({ status: false, message: err.message });
      });
  } catch (error) {
    return res.status(400).json({ status: false, message: error.message });
  }
};

export const updateRateAnalysis = async (req, res) => {
  const { tender_id } = req.params;
  const { work_items } = req.body;

  try {
    const updatedDoc = await WorkItemService.updateRateAnalysis(work_items, tender_id);
    res.status(200).json({ message: 'Rate analysis updated successfully', data: updatedDoc });
  } catch (err) {
    res.status(500).json({ message: 'Error updating rate analysis', error: err.message });
  }
}

export const freezeRateAnalysis = async (req, res) => {
  const { tender_id } = req.params;

  try {
    const updatedDoc = await WorkItemService.freezeRateAnalysis(tender_id);
    res.status(200).json({ message: 'Rate analysis frozen successfully', data: updatedDoc });
  } catch (err) {
    res.status(500).json({ message: 'Error freezing rate analysis', error: err.message });
  }
}
