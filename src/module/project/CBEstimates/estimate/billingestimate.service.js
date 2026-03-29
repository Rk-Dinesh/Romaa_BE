import mongoose from "mongoose";
import BillingEstimateModel from "./billingestimate.model.js";

class BillingEstimateService {

    // --- 1. Hierarchy Level Detector ---
    static getLevelFromCode(code) {
        if (!code) return 0;
        code = code.toString().trim();

        if (/^Day/i.test(code)) return 1.5; // Level 1.5: Day-1
        if (/^[A-Z]{2,}[\s\-_]?\d+$/i.test(code)) return 1; // Level 1: ID001
        if (/^[A-Z]$/i.test(code)) return 2; // Level 2: A, B
        if (/^\d+(\.\d+)?$/.test(code)) return 3; // Level 3: 1, 1.1

        return 0;
    }

static async bulkInsert(csvRows, tender_id, bill_id, created_by_user) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        // --- Helper 1: Case-Insensitive Data Fetcher ---
        const getValue = (row, key) => (row[key] || row[key.toLowerCase()] || row[key.toUpperCase()] || "").toString().trim();

        // --- Helper 2: Safe Number Parser ---
        const safeParseFloat = (val) => {
            if (!val || val === "-" || val === "" || val === ".") return 0;
            const num = Number(val);
            return isNaN(num) ? 0 : num;
        };

        // Find existing doc for this tender+bill or create new
        let targetDoc = await BillingEstimateModel.findOne({ tender_id, bill_id }).session(session);

        if (!targetDoc) {
            targetDoc = new BillingEstimateModel({
                tender_id,
                bill_id,
                created_by_user: created_by_user || "ADMIN",
                items: []
            });
        }

        // --- CSV Processing ---

        const items = [];
        let currentWorkItem = null;
        let currentDetail = null;
        let activeDay = ""; 

        for (const row of csvRows) {
            const code = getValue(row, "Code");
            if (!code) continue;

            const level = this.getLevelFromCode(code);
            const desc = getValue(row, "Description");
            const unit = getValue(row, "Unit");

            const nos1 = getValue(row, "Nos1");
            const x = getValue(row, "X");
            const nos2 = getValue(row, "Nos2");
            const nos = nos2 ? `${nos1}${x}${nos2}` : nos1;

            const length = safeParseFloat(getValue(row, "Length"));
            const breadth = safeParseFloat(getValue(row, "Breadth"));
            const depth = safeParseFloat(getValue(row, "Depth"));
            const qty = safeParseFloat(getValue(row, "Quantity"));
            const mb_book_ref = getValue(row, "Mbook");

            // --- Level 1.5: Day ---
            if (level === 1.5) {
                activeDay = code;
                continue;
            }

            // --- Level 1: Root Item ---
            if (level === 1) {
                currentWorkItem = {
                    item_code: code,
                    item_name: desc,
                    day: activeDay,
                    unit: unit,
                    quantity: qty,
                    mb_book_ref: mb_book_ref || "",
                    details: []
                };
                items.push(currentWorkItem);
                currentDetail = null;
            }
            // --- Level 2: Sub-Group ---
            else if (level === 2) {
                if (!currentWorkItem) continue;
                currentDetail = {
                    description: desc,
                    nos: nos,
                    length, breadth, depth,
                    quantity: qty,
                    details: []
                };
                currentWorkItem.details.push(currentDetail);
            }
            // --- Level 3: Measurements ---
            else if (level === 3) {
                const subDetail = {
                    description: desc,
                    nos: nos,
                    length, breadth, depth,
                    quantity: qty
                };

                if (currentDetail) {
                    currentDetail.details.push(subDetail);
                } else if (currentWorkItem) {
                    // Handle loose level 3 items by wrapping in a general container
                    currentDetail = { description: "General", details: [] };
                    currentWorkItem.details.push(currentDetail);
                    currentDetail.details.push(subDetail);
                }
            }
        }

        // --- Update Items & Save ---
        targetDoc.items = items; // Overwrite items list with new CSV data
        await targetDoc.save({ session });

        await session.commitTransaction();
        session.endSession();

        return {
            success: true,
            message: `Successfully processed bill ${targetDoc.bill_id}. Items: ${items.length}`,
            data: targetDoc,
        };

    } catch (err) {
        await session.abortTransaction();
        session.endSession();
        throw err;
    }
}

    static async getDetailedBill(tender_id, bill_id) {
        return await BillingEstimateModel.findOne({ tender_id, bill_id });
    }
}

export default BillingEstimateService;