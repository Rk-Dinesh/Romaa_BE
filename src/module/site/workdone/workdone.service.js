import IdcodeServices from "../../idcode/idcode.service.js";
import WorkOrderRequestModel from "../../project/workorderReqIssue/workorderReqIssue.model.js";
import WorkDoneModel from "./workdone.model.js";

class WorkDoneService {
    static async createWorkDone1(payload) {
        const idname = "WorkDone";
        const idcode = "WD";

        // 1. Generate Readable ID (e.g., WD-1001)
        await IdcodeServices.addIdCode(idname, idcode);
        const generatedWorkDoneId = await IdcodeServices.generateCode(idname);

        const workOrderDoc = await WorkOrderRequestModel.findOne({ requestId: payload.work_order_id });

        if (!workOrderDoc) {
            throw new Error("Work Order not found");
        }

        if (workOrderDoc.materialsRequired && workOrderDoc.materialsRequired.length > 0) {

            workOrderDoc.materialsRequired.forEach((reqItem) => {

                const dbItem = workOrderDoc.materialsRequired.find(
                    (item) => item.materialName === reqItem.materialName
                );

                if (dbItem) {
                    const reqQty = Number(reqItem.quantity);

                    if (dbItem.ex_quantity < reqQty) {
                        throw new Error(`Insufficient quantity for ${reqItem.materialName}. Available: ${dbItem.ex_quantity}`);
                    }

                    dbItem.ex_quantity = dbItem.ex_quantity - reqQty;
                }
            });

            await workOrderDoc.save();
        }


        // 2. Process the Array of Items
        // We sanitize the data to ensure no crashes (e.g. converting strings to numbers)
        const processedItems = (payload.dailyWorkDone || []).map((item) => ({
            item_description: item.item_description,

            dimensions: {
                length: Number(item.dimensions.length) || 0,
                breadth: Number(item.dimensions.breadth) || 0,
                height: Number(item.dimensions.height) || 0,
            },

            quantity: Number(item.quantity) || 0,
            unit: item.unit || "Nos",
            remarks: item.remarks || "",
            contractor_details: item.contractor_details || "NMR",
        }));

        const totalQty = processedItems.length;

        // 4. Create the Document
        const workDoneEntry = new WorkDoneModel({
            workDoneId: generatedWorkDoneId,
            tender_id: payload.tender_id,
            workOrder_id: payload.work_order_id,
            report_date: payload.report_date ? new Date(payload.report_date) : new Date(),
            status: "Submitted",
            dailyWorkDone: processedItems, // The array of rows
            totalWorkDone: totalQty,
            created_by: payload.created_by || "Admin"
        });

        // 5. Save to Database
        return await workDoneEntry.save();
    }

    static async createWorkDone(payload) {
    const idname = "WorkDone";
    const idcode = "WD";

    try {
      await IdcodeServices.addIdCode(idname, idcode);
    } catch (e) { /* Ignore if exists */ }
    const generatedWorkDoneId = await IdcodeServices.generateCode(idname);

    const workOrderDoc = await WorkOrderRequestModel.findOne({ requestId: payload.work_order_id });

    if (!workOrderDoc) {
      throw new Error("Work Order not found");
    }

    const processedItems = (payload.dailyWorkDone || []).map((item) => ({
      item_description: item.item_description,
      
      dimensions: {
        length: Number(item.dimensions?.length) || Number(item.length) || 0,
        breadth: Number(item.dimensions?.breadth) || Number(item.breadth) || 0,
        height: Number(item.dimensions?.height) || Number(item.height) || 0,
      },

      quantity: Number(item.quantity) || 0,
      unit: item.unit || "Nos",
      remarks: item.remarks || "",
      contractor_details: item.contractor_details || "NMR",
      
      workDoneId: generatedWorkDoneId, 
      tender_id: payload.tender_id,
      report_date: payload.report_date ? new Date(payload.report_date) : new Date(),
      status: "Submitted",
    }));

    if (workOrderDoc.materialsRequired && workOrderDoc.materialsRequired.length > 0) {
      
      for (const reqItem of processedItems) {
        
        const dbItem = workOrderDoc.materialsRequired.find(
          (item) => item.materialName === reqItem.item_description
        );
        if (dbItem) {
          const reqQty = Number(reqItem.quantity);

          if (dbItem.ex_quantity < reqQty) {
            throw new Error(`Insufficient quantity for ${reqItem.item_description}. Available: ${dbItem.ex_quantity}, Requested: ${reqQty}`);
          }

          dbItem.ex_quantity = dbItem.ex_quantity - reqQty;
        }
      }
      await workOrderDoc.save();
    }
    const totalQty = processedItems.length;

    const workDoneEntry = new WorkDoneModel({
      workDoneId: generatedWorkDoneId,
      tender_id: payload.tender_id,
      workOrder_id: payload.work_order_id,
      report_date: payload.report_date ? new Date(payload.report_date) : new Date(),
      status: "Submitted",
      dailyWorkDone: processedItems,
      totalWorkDone: totalQty,
      created_by: payload.created_by || "Admin"
    });

    return await workDoneEntry.save();
  }
    static async getAllWorkDoneByTender(tender_id) {
        const reports = await WorkDoneModel.find({ tender_id })
            .select("-dailyWorkDone")
            .sort({ workDoneId: -1 });

        return reports;
    }

    static async getWorkDoneSpecific(tender_id, workDoneId) {
        const report = await WorkDoneModel.findOne({ tender_id, workDoneId });

        if (!report) {
            throw new Error("Work Done Report not found");
        }

        return report;
    }
}

export default WorkDoneService;