import WorkItemModel from './rateanalysis.model.js';
import csvParser from 'csv-parser';
import fs from 'fs';

function groupLinesByCategory(lines) {
  // Group lines by 'category'
  const groups = {};
  for (const line of lines) {
    const { category, ...rest } = line;
    if (!groups[category]) groups[category] = [];
    groups[category].push(rest);
  }
  return Object.entries(groups).map(([category, sub]) => ({ category, sub }));
}

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

  static async getWorkItemsByTenderId(tender_id) {
    return await WorkItemModel.findOne({tender_id});
  }

  static async updateWorkItem(id, updateData) {
    return await WorkItemModel.findByIdAndUpdate(id, updateData, { new: true });
  }

  static async deleteWorkItem(id) {
    return await WorkItemModel.findByIdAndDelete(id);
  }


  static async bulkInsert1(csvRows, tender_id) {
    // Group rows by itemNo and workItem
    const groupedByItem = {};
    csvRows.forEach(row => {
      const itemKey = row.itemNo;
      if (!groupedByItem[itemKey]) {
        groupedByItem[itemKey] = {
          itemNo: Number(row.itemNo),
          workItem: row.workItem,
          unit: null,
          output: null,
          finalRate: null,
          linesByCategory: {}
        };
      }

      const item = groupedByItem[itemKey];

      // Normalize category name, just in case, to uppercase and underscores for consistency
      let category = row.category ? row.category.toUpperCase().replace(/\s+/g, "_") : "";

      if (category === 'MAIN_ITEM' || category === 'MAINITEM') {
        // Main item line gives unit, output, finalRate for work item
        item.unit = row.unit || null;
        item.output = row.output !== undefined && row.output !== "" ? Number(row.output) : null;
        item.finalRate = row.finalRate !== undefined && row.finalRate !== "" ? Number(row.finalRate) : null;
      } else if (category) {
        // Other categories grouped by category
        if (!item.linesByCategory[category]) {
          item.linesByCategory[category] = [];
        }
        // Push line with full field set
        item.linesByCategory[category].push({
         
          description: row.description || "",
          unit: row.unit || "",
          quantity: row.quantity !== undefined && row.quantity !== "" ? Number(row.quantity) : null,
          output: row.output !== undefined && row.output !== "" ? Number(row.output) : null,
          rate: row.rate !== undefined && row.rate !== "" ? Number(row.rate) : null,
          amount: row.amount !== undefined && row.amount !== "" ? Number(row.amount) : null,
          finalRate: row.finalRate !== undefined && row.finalRate !== "" ? Number(row.finalRate) : null,
        });
      }
    });

    console.log(groupedByItem);
    

 const workItems = Object.values(groupedByItem).map(item => {
  const lines = item.linesByCategory && typeof item.linesByCategory === "object"
    ? Object.entries(item.linesByCategory).map(([category, subs]) => ({
        category,
        sub: Array.isArray(subs) ? subs : [],
      }))
    : [];

  return {
    itemNo: item.itemNo,
    workItem: item.workItem,
    unit: item.unit,
    output: item.output,
    finalRate: item.finalRate,
    lines,
  };
});


    // Upsert the document for tender_id
    const updatedDoc = await WorkItemModel.findOneAndUpdate(
      { tender_id },
      { tender_id, work_items: workItems },
      { upsert: true, new: true }
    );

    // Return work_items in expected nested format
    return updatedDoc.work_items;
  }





}

export default WorkItemService;





