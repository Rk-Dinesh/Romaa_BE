import BoqModel from "./boq.model.js";
import TenderModel from "../tender/tender.model.js";
import IdcodeServices from "../../idcode/idcode.service.js";

class BoqService {
    
 static async addBoq(boqData) {
    const idname = "BOQ";
    const idcode = "BOQ";
    await IdcodeServices.addIdCode(idname, idcode);
    const boq_id = await IdcodeServices.generateCode(idname);
    if (!boq_id) throw new Error("Failed to generate BOQ ID");

    if (boqData.items && boqData.items.length > 0) {
      boqData.items = boqData.items.map(item => ({
        ...item,
        final_amount: item.quantity * (item.final_unit_rate || 0),
        zero_cost_final_amount: item.quantity * (item.zero_cost_unit_rate || 0)
      }));

      boqData.total_amount = boqData.items.reduce(
        (sum, item) => sum + (item.final_amount || 0),
        0
      );
    }

    const boq = new BoqModel({ boq_id, ...boqData });
    const savedBoq = await boq.save();

    // 🔹 Auto-sync BoQ values to Tender
    if (boqData.tender_id) {
      await TenderModel.updateOne(
        { tender_id: boqData.tender_id },
        {
          $set: {
            BoQ_id: boq_id,
            boq_final_value: savedBoq.total_amount || 0,
            zeroCost_final_value: savedBoq.items.reduce(
              (sum, i) => sum + (i.zero_cost_final_amount || 0),
              0
            )
          }
        }
      );
    }

    return savedBoq;
  }

static async addOrUpdateBoqItem(boqData) {
  const { tender_id, items = [], ...rest } = boqData;
  if (!tender_id) throw new Error("tender_id is required");

  // 🔹 Generate unique code for each new BOQ Item
  const updatedItems = await Promise.all(
    items.map(async (item) => {
      // generate code for this item
      const idname = "BOQ_ITEM";
      const idcode = "ITEM";
      await IdcodeServices.addIdCode(idname, idcode);
      const item_code = await IdcodeServices.generateCode(idname);

      return {
        ...item,
        item_code, // override or set new field
        final_amount: item.quantity * (item.final_unit_rate || 0),
        zero_cost_final_amount: item.quantity * (item.zero_cost_unit_rate || 0),
      };
    })
  );

  // 🔹 Check if BOQ already exists
  let boq = await BoqModel.findOne({ tender_id });

  if (boq) {
    // Append with unique item codes
    boq.items.push(...updatedItems);

    // Recalc totals
    boq.total_amount = boq.items.reduce((sum, i) => sum + (i.final_amount || 0), 0);

    const savedBoq = await boq.save();

    // Sync to Tender
    await TenderModel.updateOne(
      { tender_id },
      {
        $set: {
          BoQ_id: savedBoq.boq_id,
          boq_final_value: savedBoq.total_amount || 0,
          zeroCost_final_value: savedBoq.items.reduce(
            (sum, i) => sum + (i.zero_cost_final_amount || 0),
            0
          ),
        },
      }
    );

    return savedBoq;
  } 
  else {
    // 🔹 Generate BOQ ID
    const idname = "BOQ";
    const idcode = "BOQ";
    await IdcodeServices.addIdCode(idname, idcode);
    const boq_id = await IdcodeServices.generateCode(idname);
    if (!boq_id) throw new Error("Failed to generate BOQ ID");

    // Calculate total
    const total_amount = updatedItems.reduce((sum, i) => sum + (i.final_amount || 0), 0);

    // Create new BOQ
    const newBoq = new BoqModel({
      boq_id,
      tender_id,
      items: updatedItems,
      total_amount,
      ...rest,
    });

    const savedBoq = await newBoq.save();

    // Sync to Tender
    await TenderModel.updateOne(
      { tender_id },
      {
        $set: {
          BoQ_id: boq_id,
          boq_final_value: savedBoq.total_amount || 0,
          zeroCost_final_value: savedBoq.items.reduce(
            (sum, i) => sum + (i.zero_cost_final_amount || 0),
            0
          ),
        },
      }
    );

    return savedBoq;
  }
}

  // Get all BoQs
  static async getAllBoqs() {
    return await BoqModel.find();
  }

  // Get BoQ by ID
  static async getBoqById(boq_id) {
    return await BoqModel.findOne({ boq_id });
  }


  // Update BoQ and sync to Tender
  static async updateBoq(boq_id, updateData) {
    if (updateData.items && updateData.items.length > 0) {
      updateData.items = updateData.items.map(item => ({
        ...item,
        final_amount: item.quantity * (item.final_unit_rate || 0),
      
      }));

      updateData.total_amount = updateData.items.reduce(
        (sum, item) => sum + (item.final_amount || 0),
        0
      );
    }

    const updatedBoq = await BoqModel.findOneAndUpdate(
      { boq_id },
      { $set: updateData },
      { new: true }
    );

    // 🔹 Sync to Tender if found
    if (updatedBoq && updatedBoq.tender_id) {
      await TenderModel.updateOne(
        { tender_id: updatedBoq.tender_id },
        {
          $set: {
            boq_final_value: updatedBoq.total_amount || 0,
          }
        }
      );
    }

    return updatedBoq;
  }

  // Add single item and sync to Tender
  static async addItemToBoq(boq_id, item) {
    item.final_amount = item.quantity * (item.final_unit_rate || 0);
    item.zero_cost_final_amount =
      item.quantity * (item.zero_cost_unit_rate || 0);

    const boq = await BoqModel.findOneAndUpdate(
      { boq_id },
      {
        $push: { items: item },
        $inc: { total_amount: item.final_amount || 0 }
      },
      { new: true }
    );

    if (!boq) throw new Error("BOQ record not found");

    // 🔹 Recalculate zeroCost_final_value from full BoQ and sync to Tender
    if (boq.tender_id) {
      const zeroCostTotal = boq.items.reduce(
        (sum, i) => sum + (i.zero_cost_final_amount || 0),
        0
      );

      await TenderModel.updateOne(
        { tender_id: boq.tender_id },
        {
          $set: {
            boq_final_value: boq.total_amount || 0,
            zeroCost_final_value: zeroCostTotal
          }
        }
      );
    }

    return boq;
  }

  // Remove item by item_code
  static async removeItemFromBoq(tender_id, item_code) {
    const boq = await BoqModel.findOne({ tender_id });
    if (!boq) throw new Error("BOQ record not found");

    boq.items = boq.items.filter(item => item.item_code !== item_code);
    boq.total_amount = boq.items.reduce(
      (sum, item) => sum + (item.final_amount || 0), 0
    );

    return await boq.save();
  }

  // Delete entire BoQ
  static async deleteBoq(boq_id) {
    return await BoqModel.findOneAndDelete({ boq_id });
  }

  static async getBoqItemsPaginated(tender_id, page, limit, search) {
    // 1. Find the BOQ for the given tender_id, only selecting items array
    const boq = await BoqModel.findOne(
      { tender_id },
      { items: 1, _id: 0 }
    ).lean();

    if (!boq || !boq.items) {
      return { total: 0, items: [] };
    }

    let items = boq.items;

    // 2. Optional search in items (by description, item_code, category, etc.)
    if (search) {
      const regex = new RegExp(search, "i");
      items = items.filter(
        (item) =>
          regex.test(item.description) ||
          regex.test(item.item_code) ||
          regex.test(item.category)
      );
    }

    // 3. Pagination calculation
    const total = items.length;
    const startIndex = (page - 1) * limit;
    const paginatedItems = items.slice(startIndex, startIndex + limit);

    return { total, items: paginatedItems };
  }
  static async findBoqByTenderId(tender_id) {
    return await BoqModel.findOne(
      { tender_id },
      { boq_id: 1, tender_id: 1, status: 1, _id: 0 } // ✅ Only minimal fields
    ).lean();
  }

static async bulkInsert(csvRows, createdByUser, tender_id, phase = "", parsedRevision = 1, prepared_by = "", approved_by = "") {
  const idname = "BOQ_ITEM";
  const idcode = "ITEM";
  await IdcodeServices.addIdCode(idname, idcode);

  // Step 1: Generate unique item_codes sequentially
  const itemCodes = [];
  for (let i = 0; i < csvRows.length; i++) {
    const code = await IdcodeServices.generateCode(idname);
    if (!code) throw new Error("Failed to generate unique item_code");
    itemCodes.push(code);
  }

  // Step 2: Map CSV rows to BOQ items with unique codes
  const items = csvRows.map((row, idx) => {
    const quantity = Number(row.quantity);
    const final_unit_rate = Number(row.final_unit_rate);


    return {
      item_code: itemCodes[idx],
      item_name: row.item_name,
      description: row.description,
      specification: row.specification,
      unit: row.unit,
      quantity,
      final_unit_rate,
      final_amount: quantity * final_unit_rate,
      category: row.category,
      remarks: row.remarks,
      work_section: row.work_section,
    };
  });

  // Check if BOQ for tender already exists
  let boq = await BoqModel.findOne({ tender_id });

  if (boq) {
    // Append new items
    boq.items.push(...items);
    boq.total_amount = boq.items.reduce((sum, i) => sum + (i.final_amount || 0), 0);
    boq.phase = phase || boq.phase;
    boq.revision = parsedRevision || boq.revision;
    boq.status = boq.status || "Draft";
    boq.prepared_by = prepared_by || boq.prepared_by;
    boq.approved_by = approved_by || boq.approved_by;
    boq.created_by_user = createdByUser || boq.created_by_user;
  } else {
    const idNameBoq = "BOQ";
    const idCodeBoq = "BOQ";
    await IdcodeServices.addIdCode(idNameBoq, idCodeBoq);
    const boq_id = await IdcodeServices.generateCode(idNameBoq);
    if (!boq_id) throw new Error("Failed to generate BOQ ID");

    boq = new BoqModel({
      boq_id,
      tender_id,
      phase,
      revision: parsedRevision,
      status: "Draft",
      items,
      total_amount: items.reduce((sum, i) => sum + (i.final_amount || 0), 0),
      prepared_by,
      approved_by,
      created_by_user: createdByUser,
      prepared_date: new Date(),
      approved_date: new Date(),
    });
  }

  const savedBoq = await boq.save();

  // Sync to Tender collection
  await TenderModel.updateOne(
    { tender_id },
    {
      $set: {
        BoQ_id: savedBoq.boq_id,
        boq_final_value: savedBoq.total_amount || 0,
      },
    }
  );

  return savedBoq;
}


static async getBoqItems(tender_id) {
  const boq = await BoqModel.findOne({ tender_id }).lean();

  if (!boq) {
    return null;
  }

  return boq; 
}

static async getDrawingQuantity(tender_id) {
  const boq = await BoqModel.findOne({ tender_id }).lean();
          if (!boq) return [];
        return boq.items.map(item => ({
            item_id: item.item_id,
            item_name: item.item_name,
            unit: item.unit,
            quantity: item.quantity,
            n_rate: item.n_rate,
            drawing_quantity: item.drawing_quantity,
            variable_quantity: item.variable_quantity,
            variable_amount: item.variable_amount,
        }));
}

static async bulkUpdateDrawingQuantity(tender_id, itemsPayload) {
    // 1. Validation
    if (!itemsPayload || !Array.isArray(itemsPayload)) {
        throw new Error("Invalid data: 'items' must be an array.");
    }

    // 2. Fetch BOQ
    const boq = await BoqModel.findOne({ tender_id });
    if (!boq) throw new Error("BOQ not found for this tender");

    // 3. Create Lookup Map 
    // Key: item_code (from payload) -> Value: drawing_quantity
    const updateMap = new Map();
    itemsPayload.forEach(payloadItem => {
        if (payloadItem.item_code && payloadItem.drawing_quantity !== undefined) {
            updateMap.set(payloadItem.item_code, Number(payloadItem.drawing_quantity));
        }
    });

    let isModified = false;

    // 4. Iterate DB Items
    for (const item of boq.items) {
        // MATCHING LOGIC: 
        // We check if the DB item's "item_id" exists as a key in our map (which used payload's "item_code")
        if (updateMap.has(item.item_id)) {
            const newDrawingQty = updateMap.get(item.item_id);

            // Update fields
            item.drawing_quantity = newDrawingQty;
            
            // Recalculate variables based on DB source of truth
            if (newDrawingQty === 0) {
                item.variable_quantity = 0;
                item.variable_amount = 0;
            } else {
                item.variable_quantity = item.quantity - newDrawingQty;
                item.variable_amount = item.variable_quantity * item.n_rate;
            }
            
            isModified = true;
        }
    }

    // 5. Save if changes occurred
    if (isModified) {
        await boq.save();
    }

    return { success: true, message: "Bulk update successful" };
}


}

export default BoqService;
