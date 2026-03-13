import IdcodeServices from "../../idcode/idcode.service.js";
import WorkOrderRequestModel from "../../project/workorderReqIssue/workorderReqIssue.model.js";
import WorkDoneModel from "./workorderdone.model.js";

class WorkDoneService {


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

    static async bulkCreateWorkDone(payloads) {
        if (!Array.isArray(payloads) || payloads.length === 0) {
            throw new Error("payloads must be a non-empty array");
        }

        const idname = "WorkDone";
        const idcode = "WD";
        try {
            await IdcodeServices.addIdCode(idname, idcode);
        } catch (e) { /* Ignore if exists */ }

        // Pre-fetch all unique work orders in one query
        const uniqueWorkOrderIds = [...new Set(payloads.map(p => p.work_order_id))];
        const workOrderDocs = await WorkOrderRequestModel.find({
            requestId: { $in: uniqueWorkOrderIds }
        });
        const workOrderMap = Object.fromEntries(workOrderDocs.map(doc => [doc.requestId, doc]));

        // Validate all work orders exist before doing any mutations
        for (const payload of payloads) {
            if (!workOrderMap[payload.work_order_id]) {
                throw new Error(`Work Order not found: ${payload.work_order_id}`);
            }
        }

        // Generate IDs sequentially (atomic per call)
        const generatedIds = [];
        for (let i = 0; i < payloads.length; i++) {
            generatedIds.push(await IdcodeServices.generateCode(idname));
        }

        // Build documents and apply quantity deductions to in-memory work order docs
        const documents = [];
        for (let i = 0; i < payloads.length; i++) {
            const payload = payloads[i];
            const workOrderDoc = workOrderMap[payload.work_order_id];
            const generatedWorkDoneId = generatedIds[i];

            const processedItems = (payload.dailyWorkDone || []).map(item => ({
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
            }));

            if (workOrderDoc.materialsRequired && workOrderDoc.materialsRequired.length > 0) {
                for (const reqItem of processedItems) {
                    const dbItem = workOrderDoc.materialsRequired.find(
                        m => m.materialName === reqItem.item_description
                    );
                    if (dbItem) {
                        const reqQty = Number(reqItem.quantity);
                        if (dbItem.ex_quantity < reqQty) {
                            throw new Error(
                                `Insufficient quantity for ${reqItem.item_description} in work order ${payload.work_order_id}. ` +
                                `Available: ${dbItem.ex_quantity}, Requested: ${reqQty}`
                            );
                        }
                        dbItem.ex_quantity -= reqQty;
                    }
                }
            }

            documents.push({
                workDoneId: generatedWorkDoneId,
                tender_id: payload.tender_id,
                workOrder_id: payload.work_order_id,
                report_date: payload.report_date ? new Date(payload.report_date) : new Date(),
                status: "Submitted",
                dailyWorkDone: processedItems,
                totalWorkDone: processedItems.length,
                created_by: payload.created_by || "Admin",
            });
        }

        // Persist all mutated work order docs
        await Promise.all(workOrderDocs.map(doc => doc.save()));

        // Bulk insert all work done records
        const inserted = await WorkDoneModel.insertMany(documents, { ordered: true });
        return inserted;
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

    static async getWorkDoneSummaryByDate(tender_id) {
        const summary = await WorkDoneModel.aggregate([
            { $match: { tender_id } },
            {
                $group: {
                    _id: { $dateToString: { format: "%Y-%m-%d", date: "$report_date" } },
                    tender_id: { $first: "$tender_id" },
                    total_work_orders: { $sum: 1 },
                }
            },
            { $sort: { _id: -1 } },
            {
                $lookup: {
                    from: "tenders",
                    localField: "tender_id",
                    foreignField: "tender_id",
                    as: "tenderInfo",
                }
            },
            {
                $project: {
                    _id: 0,
                    report_date: "$_id",
                    tender_id: 1,
                    total_work_orders: 1,
                    project_name: { $arrayElemAt: ["$tenderInfo.tender_project_name", 0] },
                }
            }
        ]);

        return summary;
    }

    static async getWorkDoneReportDate(tender_id, report_date) {
        const start = new Date(report_date);
        start.setUTCHours(0, 0, 0, 0);
        const end = new Date(report_date);
        end.setUTCHours(23, 59, 59, 999);

        const reports = await WorkDoneModel.find({
            tender_id,
            report_date: { $gte: start, $lte: end }
        });

        if (!reports.length) {
            throw new Error("Work Done Report not found");
        }

        return reports;
    }
}

export default WorkDoneService;