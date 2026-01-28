import mongoose from "mongoose";
import BillingEstimateModel from "./billingestimate.model.js";
import BillingService from "../billing/billing.service.js";

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

static async bulkInsert(csvRows, tender_id, abstract_name, user_sequence = null, created_by_user) {
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

        // --- Logic: Bill ID & Sequence & Target Document ---
        // Get the last sequence to determine auto-increment if needed
        const lastBill = await BillingEstimateModel.findOne({ tender_id })
            .sort({ bill_sequence: -1 })
            .session(session);

        const lastSequence = lastBill ? lastBill.bill_sequence : 0;

        let targetDoc = null; 
        let final_sequence = 0;
        let final_bill_id = "";

            // --- SCENARIO 1: Abstract Estimate ---
        if (abstract_name === "Abstract Estimate") {
            
            // Step A: If user_sequence is provided, try to find the existing document
            if (user_sequence !== null) {
                targetDoc = await BillingEstimateModel.findOne({ 
                    tender_id, 
                    bill_sequence: user_sequence 
                }).session(session);
            }

            // Step B: Decision - Update Existing OR Create New
            if (targetDoc) {
                // --- UPDATE EXISTING ---
                // Document found, we will overwrite its items below
                final_sequence = targetDoc.bill_sequence;
                final_bill_id = targetDoc.bill_id;
            } else {
                // --- CREATE NEW ---
                // Triggered if: 
                // 1. user_sequence was null (User wants new)
                // 2. OR user_sequence was provided but not found in DB
                
                final_sequence = lastSequence + 1;
                final_bill_id = `RA-${String(final_sequence).padStart(2, '0')}`;

                targetDoc = new BillingEstimateModel({
                    tender_id,
                    bill_id: final_bill_id,
                    bill_sequence: final_sequence,
                    abstract_name: abstract_name,
                    created_by_user: created_by_user || "ADMIN",
                    items: []
                });
            }
        }

        // --- SCENARIO 2: Other Estimates (Detailed, etc.) ---

        else {
            // Validation: Must have Abstract Estimate first to attach details to it
            if (lastSequence === 0) {
                throw new Error("No existing records found. Please upload 'Abstract Estimate' first.");
            }

            // Validation: User Sequence Mandatory for non-Abstract uploads
            if (user_sequence === null) {
                throw new Error("Please provide user sequence to link this estimate.");
            }

            // 1. Check if the Parent Abstract Estimate exists
            const parentAbstract = await BillingEstimateModel.findOne({ 
                tender_id, 
                bill_sequence: user_sequence 
            }).session(session);

            if (!parentAbstract) {
                throw new Error(`Abstract Estimate with sequence ${user_sequence} does not exist.`);
            }

            // 2. Check if THIS specific estimate type already exists for this sequence
            targetDoc = await BillingEstimateModel.findOne({ 
                tender_id, 
                bill_sequence: user_sequence, 
                abstract_name: abstract_name 
            }).session(session);

            if (!targetDoc) {
                // Create New Document linked to the same Bill ID/Sequence
                final_sequence = parentAbstract.bill_sequence;
                final_bill_id = parentAbstract.bill_id;

                targetDoc = new BillingEstimateModel({
                    tender_id,
                    bill_id: final_bill_id,
                    bill_sequence: final_sequence,
                    abstract_name: abstract_name,
                    created_by_user: created_by_user || "ADMIN",
                    items: []
                });
            } 
            // Else: targetDoc exists, we will update it below
        }

        // --- CSV Processing (Common for both scenarios) ---

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

            const nos1 = getValue(row, "Nos1") || getValue(row, "Nos");
            const nos2 = getValue(row, "Nos2");
            const nos = nos2 ? `${nos1}X${nos2}` : nos1;

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

        // --- TRIGGER BILL CREATION (Only for Abstract Estimate) ---
        if (abstract_name === "Abstract Estimate") {
            // Create a clean list (Level 1 items only) for the Bill Summary
            const level1Items = items.map(({ details, ...rest }) => rest);

            if (level1Items.length > 0) {
                await BillingService.createBill({
                    tender_id: tender_id,
                    bill_sequence: targetDoc.bill_sequence, // Use the doc's sequence
                    bill_id: targetDoc.bill_id,             // Use the doc's ID
                    items: level1Items
                });
            }
        }

        await session.commitTransaction();
        session.endSession();

        return {
            success: true,
            message: `Successfully processed '${abstract_name}' as ${targetDoc.bill_id}. Items: ${items.length}`,
            data: targetDoc,
        };

    } catch (err) {
        await session.abortTransaction();
        session.endSession();
        throw err;
    }
}

    static async getDetailedBill(tender_id,bill_id,abstract_name,bill_sequence){
        const doc = await BillingEstimateModel.findOne({ tender_id, bill_id, abstract_name,bill_sequence });
        return doc;
    }
}

export default BillingEstimateService;