import mongoose from "mongoose";
import SteelEstimateModel from "./steelEstimate.model.js";

class SteelEstimateService {
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
            // --- Helper 1: Data Fetcher ---
            const getValue = (row, key) => (row[key] || row[key.toLowerCase()] || row[key.toUpperCase()] || "").toString().trim();

            // --- Helper 2: Safe Number Parser ---
            const safeParseFloat = (val) => {
                if (!val || val === "-" || val === "" || val === ".") return 0;
                const num = Number(val);
                return isNaN(num) ? 0 : num;
            };

            // ---------------------------------------------------------
            // 1. STRICT FIND OR CREATE LOGIC
            // ---------------------------------------------------------

            // Attempt to find exact match
            let targetDoc = await SteelEstimateModel.findOne({ tender_id, bill_id }).session(session);

            if (!targetDoc) {
                targetDoc = new SteelEstimateModel({
                    tender_id,
                    bill_id,
                    created_by_user: created_by_user || "ADMIN",
                    items: []
                });
            }

            // ---------------------------------------------------------
            // 2. CSV PROCESSING
            // ---------------------------------------------------------
            const items = [];
            let currentWorkItem = null;
            let currentDetail = null;
            let activeDay = "";

            for (const row of csvRows) {
                const code = getValue(row, "Code");
                if (!code) continue;

                const level = this.getLevelFromCode(code);
                const desc = getValue(row, "Description");

                // Nos Logic (String handling for "2X4")
                const nos1 = getValue(row, "Nos1");
                const x = getValue(row, "X");
                const nos2 = getValue(row, "Nos2");
                const nos = nos2 ? `${nos1}${x}${nos2}` : nos1;

                const cutting_length = safeParseFloat(getValue(row, "CUTTING LENGTH"));
                const unit_weight = safeParseFloat(getValue(row, "UNIT WEIGHT"));

                // Steel Bars
                const mm_8 = safeParseFloat(getValue(row, "8mm"));
                const mm_10 = safeParseFloat(getValue(row, "10mm"));
                const mm_12 = safeParseFloat(getValue(row, "12mm"));
                const mm_16 = safeParseFloat(getValue(row, "16mm"));
                const mm_20 = safeParseFloat(getValue(row, "20mm"));
                const mm_25 = safeParseFloat(getValue(row, "25mm"));
                const mm_32 = safeParseFloat(getValue(row, "32mm"));

                const total_weight = safeParseFloat(getValue(row, "Total Weight"));
                const qtl = safeParseFloat(getValue(row, "Qtl"));

                if (level === 1.5) {
                    activeDay = code;
                    continue;
                }

                if (level === 1) {
                    currentWorkItem = {
                        item_code: code,
                        item_name: desc,
                        day: activeDay,
                        mm_8, mm_10, mm_12, mm_16, mm_20, mm_25, mm_32,
                        total_weight,
                        qtl,
                        details: []
                    };
                    items.push(currentWorkItem);
                    currentDetail = null;
                }
                else if (level === 2) {
                    if (!currentWorkItem) continue;
                    currentDetail = { description: desc, details: [] };
                    currentWorkItem.details.push(currentDetail);
                }
                else if (level === 3) {
                    const subDetail = {
                        description: desc,
                        nos: nos, // Make sure Schema defines this as String
                        cutting_length,
                        unit_weight,
                        mm_8, mm_10, mm_12, mm_16, mm_20, mm_25, mm_32
                    };

                    if (currentDetail) {
                        currentDetail.details.push(subDetail);
                    } else if (currentWorkItem) {
                        currentDetail = { description: "General", details: [] };
                        currentWorkItem.details.push(currentDetail);
                        currentDetail.details.push(subDetail);
                    }
                }
            }

            // ---------------------------------------------------------
            // 3. SAVE
            // ---------------------------------------------------------
            targetDoc.items = items;
            await targetDoc.save({ session });

            await session.commitTransaction();
            session.endSession();

            return {
                status: true,
                message: `Steel estimate for bill ${targetDoc.bill_id} processed successfully. Total items: ${items.length}`,
                data: targetDoc,
            };

        } catch (err) {
            await session.abortTransaction();
            session.endSession();
            throw err;
        }
    }
    static async getDetailedSteelEstimate(tender_id, bill_id) {
        return await SteelEstimateModel.findOne({ tender_id, bill_id }).lean();
    }
}

export default SteelEstimateService;