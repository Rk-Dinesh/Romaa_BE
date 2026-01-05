import IdcodeServices from "../../idcode/idcode.service.js";
import WorkDoneModel from "./workdone.model.js";

class WorkDoneService {
    static async createWorkDone(payload) {
        const idname = "WorkDone";
        const idcode = "WD";

        // 1. Generate Readable ID (e.g., WD-1001)
        await IdcodeServices.addIdCode(idname, idcode);
        const generatedWorkDoneId = await IdcodeServices.generateCode(idname);

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
            report_date: payload.report_date ? new Date(payload.report_date) : new Date(),
            status: "Submitted",
            dailyWorkDone: processedItems, // The array of rows
            totalWorkDone: totalQty,
            created_by: payload.created_by || "Admin"
        });

        // 5. Save to Database
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