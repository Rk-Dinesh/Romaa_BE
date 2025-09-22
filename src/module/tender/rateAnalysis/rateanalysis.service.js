import WorkItemModel from './rateanalysis.model.js';
import csvParser from 'csv-parser';
import fs from 'fs';

class WorkItemService {
  static async addWorkItem(data) {
    const workItem = new WorkItemModel(data);
    return await workItem.save();
  }

  static async getAllWorkItems() {
    return await WorkItemModel.find();
  }

  static async getWorkItemById(id) {
    return await WorkItemModel.findById(id);
  }

  static async updateWorkItem(id, updateData) {
    return await WorkItemModel.findByIdAndUpdate(id, updateData, { new: true });
  }

  static async deleteWorkItem(id) {
    return await WorkItemModel.findByIdAndDelete(id);
  }

 static async bulkInsert(csvRows) {
    const workItems = csvRows.map(row => {
      let lines = [];
      if (row.lines) {
        try {
          lines = JSON.parse(row.lines);
        } catch {
          lines = [];
        }
      }
      return {
        itemNo: Number(row.itemNo),
        workItem: row.workItem,
        lines,
      };
    });

    // Insert many and return the inserted docs
    const insertedDocs = await WorkItemModel.insertMany(workItems);

    // Convert documents to plain JS objects with required formatting
    const formattedResult = insertedDocs.map(doc => {
      return {
        itemNo: doc.itemNo,
        workItem: doc.workItem,
        lines: doc.lines.map(line => ({
          category: line.category,
          subCategory: line.subCategory || "",
          description: line.description,
          unit: line.unit || "",
          quantity: line.quantity !== undefined ? line.quantity : null,
          output: line.output !== undefined ? line.output : null,
          rate: line.rate !== undefined ? line.rate : null,
          amount: line.amount !== undefined ? line.amount : null,
          finalRate: line.finalRate !== undefined ? line.finalRate : null,
        })),
      };
    });

    return formattedResult;
  }
}

export default WorkItemService;
