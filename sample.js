 calculate quantites as per category code :           
            consumable_material: MT_CM,
            bulk_material: MT_BL,
            machinery: MY_M,
            fuel: MY_F,
            contractor: MP_C,
            nmr: MP_NMR,

calculation of ItemSchema:
             item_description: "description of category", // example: Hire JCB,Diesel
             category: "MY-M",
             unit: "unit of category", // example: Month, Lit
             quantity: "(quantity of category/working quantity of MAIN_ITEM) * quantity from BOQ",
             total_item_quantity: "sum of quantity array in itemschema in description (Hire JCB) i.e (2/855.36)*1110 + (0.5/684.288)*1110",
             unit_rate: "rate of category",
             total_amount: "quantity * unit_rate",


const boqCSv = `item_id,item_name,description,specifications,unit,quantity,n_rate,n_amount,remarks,work_section
ABS001,EARTH WORK,Laying and curing concrete for foundation,"M20 grade, 28-day curing, compressive strength 20 N/mm²",m3,1011,199.90,202098.9,Use M20 mix,Foundation
ABS002,Refilling,Brick work in cement mortar 1:6,"First class bricks, modular size 225×112×75mm, 1:6 cement mortar mix",m2,380,38.95,14801,Proper alignment required,Superstructure
`;

boq dynamically fetch based on item_No 

const sampleCSv = `itemNo,category,description,unit,working_quantity,rate
ABS001,MAIN_ITEM,,Cum,855.36,
ABS001,MY-M,Hire JCB,Month,2,80000
ABS001,MY-M,Tractor,Month,1,45000
ABS001,MY-F,Diesel,Lit,1275,96
ABS001,MP-C,Blasting,Points,1100,180
ABS001,MP-NMR,Helpers,Nos,60,700
ABS002,MAIN_ITEM,,Cum,684.288,
ABS002,MY-M,Hire JCB,Month,0.5,80000
ABS002,MY-F,Diesel,Lit,112.5,96
ABS002,MP-NMR,Helpers,Nos,15,700
`;

// in the csv file

//   ABS001 is itemNo

// MY-M is category
// Hire JCB is description
// Month is unit
// formula for quantity: (quantity of category/working quantity of MAIN_ITEM) * quantity from BOQ
    // quantity of category: 2
    // working quantity of MAIN_ITEM: 855.36
    // quantity from BOQ: 1110
    // quantity: (2/855.36)*1110 = 2.6666666666666665 to be fixed to 2.67

// ABS002 is itemNo

// MY-M is category
// Hire JCB is description
// Month is unit
// formula for quantity: (quantity of category/working quantity of MAIN_ITEM) * quantity from BOQ
    // quantity of category: 0.5
    // working quantity of MAIN_ITEM: 684.288
    // quantity from BOQ: 380    // quantity: (0.5/684.288)*380 = 0.2857142857142857 to be fixed to 0.29

//total_item_quantity: sum of quantity array in itemschema in description (Hire JCB) i.e (2/855.36)*1110 + (0.5/684.288)*380 = 2.67 + 0.29 = 2.96


{
    "tender_id":"TND014",
    "quantites":{
        "consumable_material": [],
        "bulk_material": [],
        "machinery": [
            {
                "item_description": "Hire JCB", 
                "category": "MY-M",
                "unit": "Month", 
                "quantity":[2.67,0.29],
                "total_item_quantity": 2.96,
                "unit_rate": 80000,
                "total_amount": 236800,
            },
            {
                "item_description": "Tractor", 
                "category": "MY-M",
                "unit": "Month", 
                "quantity":[1.67],
                "total_item_quantity": 1.67,
                "unit_rate": 45000,
                "total_amount": 75000,
            }
        ],
        "fuel": [
            {
                "item_description": "Diesel", 
                "category": "MY-F",
                "unit": "Lit", 
                "quantity":[1624.52 ,58.45],
                "total_item_quantity":1682.97,
                "unit_rate": 96,
                "total_amount":161565.12,
            }
        ],
        "contractor": [
            {
                "item_description": "Blasting", 
                "category": "MP-C", 
                "unit": "Points", 
                "quantity":[1800],
                "total_item_quantity": 1800,
                "unit_rate": 180,
                "total_amount": 324000,
            }
        ],
        "nmr": [
            {
                "item_description": "Helpers", 
                "category": "MP-NMR",
                "unit": "Nos", 
                "quantity":[81.66,8.16],
                "total_item_quantity": 89.82,
                "unit_rate": 700,
                "total_amount": 62874,
            }
        ]
    }
}

import mongoose from "mongoose";
import { addDays } from "date-fns";
import ScheduleLiteModel from "../models/ScheduleLiteModel.js";
import TaskModel from "../models/TaskModel.js"; // We need this to fetch the data

import mongoose from "mongoose";
import { 
    addDays, 
    format, 
    eachDayOfInterval, 
    startOfWeek, 
    endOfWeek, 
    getISOWeek 
} from "date-fns";
import ScheduleLiteModel from "../models/ScheduleLiteModel.js"; 
import TaskModel from "../models/TaskModel.js";

import mongoose from "mongoose";
import { 
    addDays, 
    format, 
    eachDayOfInterval, 
    getDate, 
    getYear 
} from "date-fns";
import ScheduleLiteModel from "../models/ScheduleLiteModel.js"; 
import TaskModel from "../models/TaskModel.js";

import mongoose from "mongoose";
import { 
    addDays, 
    format, 
    eachDayOfInterval, 
    getDate, 
    getYear 
} from "date-fns";
import ScheduleLiteModel from "../models/ScheduleLiteModel.js"; 
import TaskModel from "../models/TaskModel.js";

class ScheduleService {

    // ============================================================
    // HELPERS
    // ============================================================

    // --- Helper 1: Flatten Structure ---
    static flattenStructure(structure) {
        const flatList = [];
        const processNode = (node) => {
            flatList.push(node);
            if (node.items) node.items.forEach(processNode);
            if (node.tasks) node.tasks.forEach(processNode);
            if (node.task_wbs_ids) node.task_wbs_ids.forEach(processNode);
            if (node.active_tasks) node.active_tasks.forEach(processNode);
        };
        if (Array.isArray(structure)) structure.forEach(processNode);
        return flatList.sort((a, b) => a.row_index - b.row_index);
    }

    // --- Helper 2: Parse Predecessor ---
    static parsePredecessorString(predString) {
        if (!predString || typeof predString !== 'string') return null;
        const regex = /^(\d+)(FS|SS)?([+-]?\d+)?$/i;
        const match = predString.toString().toUpperCase().trim().match(regex);
        if (!match) return null;
        return {
            targetRowIndex: parseInt(match[1]),
            type: match[2] || "FS",
            lag: parseInt(match[3] || "0")
        };
    }

    // --- Helper 3: Metrics Logic (Strict UTC + Preserve Actuals) ---
    static recalculateTaskMetrics(task) {
        if (!task.revised_start_date || !task.revised_end_date || !task.revised_duration) return;

        // Force parse as Dates
        const start = new Date(task.revised_start_date);
        const end = new Date(task.revised_end_date);
        
        // Safety check
        if (start.getTime() > end.getTime()) return;

        // --- KEY HELPER: Generate consistent YYYY-MM-DD from any Date object ---
        const getUTCKey = (dateInput) => {
            const d = new Date(dateInput);
            if (isNaN(d.getTime())) return null;
            const year = d.getUTCFullYear();
            const month = String(d.getUTCMonth() + 1).padStart(2, '0');
            const day = String(d.getUTCDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        };

        // 1. MAP EXISTING DATA (Preserve Actuals)
        const existingMap = new Map();
        if (task.daily && Array.isArray(task.daily)) {
            task.daily.forEach(d => {
                const key = getUTCKey(d.date);
                if (key) {
                    existingMap.set(key, Number(d.quantity) || 0);
                }
            });
        }

        const totalQty = Number(task.quantity) || 0;
        const totalDuration = Number(task.revised_duration) || 1;
        
        // Linear distribution: Planned Quantity per day
        const dailyRate = totalQty / totalDuration;

        // 2. GENERATE NEW DAILY LOGS
        const newDailyLogs = [];
        
        let currentDate = new Date(Date.UTC(
            start.getUTCFullYear(),
            start.getUTCMonth(),
            start.getUTCDate()
        ));

        const endDateUTC = new Date(Date.UTC(
            end.getUTCFullYear(),
            end.getUTCMonth(),
            end.getUTCDate()
        ));

        while (currentDate <= endDateUTC) {
            const key = getUTCKey(currentDate);
            // Use existing quantity if found (Actual), else 0 (Default)
            const actualQty = existingMap.has(key) ? existingMap.get(key) : 0;

            newDailyLogs.push({
                date: new Date(currentDate), 
                quantity: actualQty,         
                status: actualQty > 0 ? "working" : "working" 
            });

            // Increment by 1 day in UTC
            currentDate.setUTCDate(currentDate.getUTCDate() + 1);
        }

        task.daily = newDailyLogs;

        // 3. HIERARCHY CALCULATION (Month -> Fixed 4 Weeks)
        const monthMap = new Map();
        const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

        newDailyLogs.forEach(dayLog => {
            const dateObj = dayLog.date;
            
            const year = dateObj.getUTCFullYear();
            const monthIndex = dateObj.getUTCMonth(); 
            const dayNum = dateObj.getUTCDate();      

            const monthKey = `${String(monthIndex + 1).padStart(2, '0')}-${year}`; 
            const monthName = monthNames[monthIndex];

            // Initialize Month Bucket
            if (!monthMap.has(monthKey)) {
                monthMap.set(monthKey, {
                    month_name: monthName,
                    year: year,
                    month_key: monthKey,
                    achieved: 0,
                    planned: 0,
                    weeks: {
                        firstweek: { label: "Week 1", number: 1, achieved: 0, planned: 0 },
                        secondweek: { label: "Week 2", number: 2, achieved: 0, planned: 0 },
                        thirdweek: { label: "Week 3", number: 3, achieved: 0, planned: 0 },
                        fourthweek: { label: "Week 4", number: 4, achieved: 0, planned: 0 }
                    }
                });
            }

            const mData = monthMap.get(monthKey);

            // Identify Week Bucket (UTC Day-based)
            let weekKey = "";
            if (dayNum <= 7) weekKey = "firstweek";
            else if (dayNum <= 14) weekKey = "secondweek";
            else if (dayNum <= 21) weekKey = "thirdweek";
            else weekKey = "fourthweek"; 

            // Add PLANNED rate
            mData.weeks[weekKey].planned += dailyRate;
            mData.planned += dailyRate;

            // Add ACHIEVED quantity
            mData.weeks[weekKey].achieved += dayLog.quantity;
            mData.achieved += dayLog.quantity;
        });

        // Convert Map to Schema-compliant Array
        task.schedule_data = Array.from(monthMap.values()).map(val => {
            const weeksArray = Object.values(val.weeks).map(w => ({
                week_label: w.label,
                week_number: w.number,
                metrics: {
                    achieved_quantity: Number(w.achieved.toFixed(2)),
                    planned_quantity: Number(w.planned.toFixed(2)),
                    lag_quantity: Number((w.planned - w.achieved).toFixed(2))
                }
            }));

            return {
                month_name: val.month_name,
                year: val.year,
                month_key: val.month_key,
                metrics: {
                    achieved_quantity: Number(val.achieved.toFixed(2)),
                    planned_quantity: Number(val.planned.toFixed(2)),
                    lag_quantity: Number((val.planned - val.achieved).toFixed(2))
                },
                weeks: weeksArray
            };
        });
    }

    // --- Helper to build BulkOp ---
    static createBulkOp(node) {
        return {
            updateOne: {
                filter: { wbs_id: node.wbs_id },
                update: {
                    $set: {
                        revised_start_date: node.revised_start_date,
                        revised_end_date: node.revised_end_date,
                        revised_duration: node.revised_duration,
                        predecessor: node.predecessor,
                        daily: node.daily,
                        schedule_data: node.schedule_data
                    }
                }
            }
        };
    }

    // ============================================================
    // API METHODS
    // ============================================================

    // --- API 1: Update Daily Quantity (Actuals) ---
    static async updateDailyQuantity(tender_id, payload) {
        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            console.log("--- START DAILY QUANTITY UPDATE ---");
            const { row_index, date, quantity } = payload;
            const updateDateStr = date; 
            const newQuantity = Number(quantity);
            const targetRowIndex = Number(row_index);

            if (!updateDateStr) throw new Error("Date is required.");
            if (isNaN(newQuantity)) throw new Error("Valid quantity is required.");

            // Parse Date to UTC midnight
            const updateDate = new Date(updateDateStr);
            const updateKey = updateDate.toISOString().split('T')[0]; 

            const tenderDoc = await ScheduleLiteModel.findOne({ tender_id }).session(session);
            if (!tenderDoc) throw new Error("Tender not found.");

            const flatNodes = this.flattenStructure(tenderDoc.structure);
            const targetNode = flatNodes.find(n => n.row_index === targetRowIndex);

            if (!targetNode) throw new Error(`Row ${targetRowIndex} not found.`);

            // Hybrid Populate
            if (targetNode.wbs_id) {
                const taskDoc = await TaskModel.findOne({ tender_id, wbs_id: targetNode.wbs_id }).session(session);
                if (taskDoc) {
                    targetNode.daily = taskDoc.daily;
                    targetNode.quantity = taskDoc.quantity;
                    targetNode.revised_duration = taskDoc.revised_duration;
                    targetNode.revised_start_date = taskDoc.revised_start_date;
                    targetNode.revised_end_date = taskDoc.revised_end_date;
                    targetNode._taskDoc = taskDoc;
                }
            }

            // Update Entry
            let entryFound = false;
            if (!targetNode.daily) targetNode.daily = [];

            targetNode.daily.forEach(log => {
                const logDate = new Date(log.date);
                const logKey = logDate.toISOString().split('T')[0];
                if (logKey === updateKey) {
                    log.quantity = newQuantity;
                    log.status = newQuantity > 0 ? "working" : log.status;
                    entryFound = true;
                }
            });

            if (!entryFound) {
                targetNode.daily.push({
                    date: updateDate,
                    quantity: newQuantity,
                    status: "working",
                    remarks: "Manual Update"
                });
            }

            // Recalculate Aggregates
            this.recalculateTaskMetrics(targetNode);

            // Save
            if (targetNode._taskDoc) {
                await TaskModel.bulkWrite([this.createBulkOp(targetNode)], { session });
            }
            tenderDoc.markModified('structure');
            await tenderDoc.save({ session });

            await session.commitTransaction();
            session.endSession();
            return { success: true, message: "Daily quantity updated." };

        } catch (error) {
            await session.abortTransaction();
            session.endSession();
            throw error;
        }
    }

    // --- API 2: Update Row Schedule (Predecessors/Duration) ---
    static async updateRowSchedule(tender_id, payload) {
        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            console.log("--- START SCHEDULE UPDATE ---");
            const { row_index, predecessor, revised_duration } = payload;
            const targetRowIndex = Number(row_index);

            const tenderDoc = await ScheduleLiteModel.findOne({ tender_id }).session(session);
            if (!tenderDoc) throw new Error("Tender not found.");

            const flatNodes = this.flattenStructure(tenderDoc.structure);

            // 3. POPULATE MISSING DATA (Hybrid)
            const wbsIdsToFetch = flatNodes
                .filter(n => n.wbs_id && (!n.revised_start_date && !n.start_date)) 
                .map(n => n.wbs_id);

            if (wbsIdsToFetch.length > 0) {
                const taskDocs = await TaskModel.find({ tender_id, wbs_id: { $in: wbsIdsToFetch } }).session(session);
                const dataMap = new Map();
                taskDocs.forEach(doc => dataMap.set(doc.wbs_id, doc));

                flatNodes.forEach(node => {
                    if (dataMap.has(node.wbs_id)) {
                        const fullData = dataMap.get(node.wbs_id);
                        
                        // CRITICAL: Copy Daily Array & Metrics so they are preserved
                        node.daily = fullData.daily;
                        node.schedule_data = fullData.schedule_data;

                        node.predecessor = fullData.predecessor;
                        node.duration = fullData.duration;
                        node.revised_duration = fullData.revised_duration;
                        node.start_date = fullData.start_date;
                        node.end_date = fullData.end_date;
                        node.revised_start_date = fullData.revised_start_date;
                        node.revised_end_date = fullData.revised_end_date;
                        node.description = fullData.description;
                        node.quantity = fullData.quantity;
                        node._taskDoc = fullData; 
                    }
                });
            }

            // 4. MAP & INITIALIZE FALLBACKS
            const fullTaskMap = new Map();
            flatNodes.forEach(node => {
                if (!node.revised_start_date && node.start_date) {
                    node.revised_start_date = new Date(node.start_date);
                }
                if (!node.revised_end_date && node.end_date) {
                    node.revised_end_date = new Date(node.end_date);
                }
                fullTaskMap.set(node.row_index, node);
            });

            const targetNode = fullTaskMap.get(targetRowIndex);
            if (!targetNode) throw new Error(`Row ${targetRowIndex} not found.`);

            let isTargetUpdated = false;

            // ====================================================
            // PHASE 1: TARGET UPDATE
            // ====================================================

            if (predecessor !== undefined) {
                const predInfo = this.parsePredecessorString(predecessor);
                if (predInfo) {
                    const parentNode = fullTaskMap.get(predInfo.targetRowIndex);
                    const pStart = parentNode?.revised_start_date || parentNode?.start_date;
                    const pEnd = parentNode?.revised_end_date || parentNode?.end_date;

                    if (parentNode && pStart) {
                        targetNode.predecessor = predecessor;
                        
                        let refDate = predInfo.type === 'SS' ? new Date(pStart) : new Date(pEnd);
                        let offset = predInfo.lag;
                        if(predInfo.type === 'FS') offset += 1;

                        const newStart = addDays(refDate, offset);
                        targetNode.revised_start_date = newStart;
                        
                        // INCLUSIVE LOGIC: End = Start + Duration - 1
                        const duration = targetNode.revised_duration || 1;
                        targetNode.revised_end_date = addDays(newStart, Math.max(0, duration - 1));
                        isTargetUpdated = true;
                    }
                }
            } else if (revised_duration !== undefined) {
                const newDuration = Number(revised_duration);
                targetNode.revised_duration = newDuration;
                if (targetNode.revised_start_date) {
                    targetNode.revised_end_date = addDays(new Date(targetNode.revised_start_date), Math.max(0, newDuration - 1));
                    isTargetUpdated = true;
                }
            }

            // ====================================================
            // PHASE 2: CASCADE
            // ====================================================

            const bulkOps = [];

            if (isTargetUpdated) {
                this.recalculateTaskMetrics(targetNode);

                if (targetNode._taskDoc) {
                    bulkOps.push(this.createBulkOp(targetNode));
                }

                for (let i = 0; i < flatNodes.length; i++) {
                    const currentNode = flatNodes[i];

                    if (currentNode.row_index <= targetRowIndex) continue;
                    if (!currentNode.predecessor) continue;

                    const predInfo = this.parsePredecessorString(currentNode.predecessor);
                    if (!predInfo || predInfo.targetRowIndex < targetRowIndex) continue;

                    const parentNode = fullTaskMap.get(predInfo.targetRowIndex);
                    const pStart = parentNode?.revised_start_date;
                    const pEnd = parentNode?.revised_end_date;

                    if (parentNode && pStart) {
                        if (!currentNode.revised_start_date && currentNode.start_date) {
                            currentNode.revised_start_date = new Date(currentNode.start_date);
                        }

                        let refDate = predInfo.type === 'SS' ? new Date(pStart) : new Date(pEnd);
                        let offset = predInfo.lag;
                        if(predInfo.type === 'FS') offset += 1;

                        const newStart = addDays(refDate, offset);
                        const duration = currentNode.revised_duration || 1;
                        const newEnd = addDays(newStart, Math.max(0, duration - 1));

                        const currentStartMs = currentNode.revised_start_date ? new Date(currentNode.revised_start_date).getTime() : 0;
                        
                        // Tolerance Check (> 1 sec diff)
                        if (Math.abs(newStart.getTime() - currentStartMs) > 1000) {
                            currentNode.revised_start_date = newStart;
                            currentNode.revised_end_date = newEnd;
                            
                            this.recalculateTaskMetrics(currentNode);
                            
                            if (currentNode._taskDoc) {
                                bulkOps.push(this.createBulkOp(currentNode));
                            }
                        }
                    }
                }

                if (bulkOps.length > 0) {
                    await TaskModel.bulkWrite(bulkOps, { session });
                }

                tenderDoc.markModified('structure');
                await tenderDoc.save({ session });
            }

            await session.commitTransaction();
            session.endSession();
            return { success: true, message: "Schedule updated." };

        } catch (error) {
            await session.abortTransaction();
            session.endSession();
            console.error("❌ Error:", error);
            throw error;
        }
    }
}

export default ScheduleService;
