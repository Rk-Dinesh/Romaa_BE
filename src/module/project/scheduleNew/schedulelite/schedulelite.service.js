import mongoose from "mongoose";
import { addDays } from "date-fns";
import IdcodeServices from "../../../idcode/idcode.service.js";
import ScheduleLiteModel from "./schedulelite.model.js";
import TaskModel from "../task/task.model.js";
import moment from "moment";

class ScheduleLiteService {

    static getLevelFromCode(code) {
        code = code.trim();
        if (/^[A-Z]$/.test(code)) return 1;
        if (/^\d+$/.test(code)) return 2;
        if (/^\d+\.\d+$/.test(code)) return 3;
        if (/^\d+[A-Z]$/.test(code)) return 4;
        if (/^\d+\.\d+\.\d+$/.test(code)) return 4;
        return 0;
    }

    static async bulkInsert(csvRows, tender_id) {
        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            // 1. Prepare Lookup Map
            const existingTasks = await TaskModel.find({ tender_id }).select("wbs_id description work_group_id work_item_id work_task_id").session(session);
            const taskLookup = new Map();
            existingTasks.forEach(t => {
                const key = `${t.work_group_id?.trim()}|${t.work_item_id?.trim()}|${t.work_task_id?.trim()}|${t.description?.trim()}`.toLowerCase();
                taskLookup.set(key, t.wbs_id);
            });

            // =========================================================
            // OPTIMIZATION START: Count New IDs Needed
            // =========================================================

            // We simulate the hierarchy build just to generate keys and check duplication
            let neededIdCount = 0;
            let tempGroup = null, tempItem = null, tempTask = null;

            for (const row of csvRows) {
                const code = row.Code ? row.Code.toString().trim() : "";
                if (!code) continue;
                const level = this.getLevelFromCode(code);
                const desc = (row.Description || "Untitled").trim();

                if (level === 1) tempGroup = desc;
                else if (level === 2) tempItem = desc;
                else if (level === 3) tempTask = desc;
                else if (level === 4) {
                    // Construct the unique key
                    const hierarchyKey = `${tempGroup}|${tempItem}|${tempTask}|${desc}`.toLowerCase();
                    // If this key doesn't exist in DB, we need a NEW ID
                    if (!taskLookup.has(hierarchyKey)) {
                        neededIdCount++;
                    }
                }
            }

            const idNameWBS = "WBS";
            // FETCH ALL IDS IN ONE GO (1 DB Call instead of 467)
            const newIdsPool = await IdcodeServices.generateBulkCodes(idNameWBS, neededIdCount);
            // =========================================================
            // OPTIMIZATION END
            // =========================================================

            // 2. Start Main Processing
            const structure = [];
            const leafTasksToSave = [];
            const activeWbsIds = new Set();
            let globalRowIndex = 0;

            let currentGroup = null;
            let currentItem = null;
            let currentWTask = null;

            for (const row of csvRows) {
                const code = row.Code ? row.Code.toString().trim() : "";
                if (!code) continue;

                globalRowIndex++;
                const level = this.getLevelFromCode(code);
                const desc = (row.Description || "Untitled").trim();

                // --- LEVEL 1 ---
                if (level === 1) {
                    currentGroup = { group_name: desc, row_index: globalRowIndex, items: [] };
                    structure.push(currentGroup);
                    currentItem = null; currentWTask = null;
                }
                // --- LEVEL 2 ---
                else if (level === 2) {
                    if (!currentGroup) throw new Error(`Row "${code}" (Level 2) missing Parent Group.`);
                    currentItem = { item_name: desc, row_index: globalRowIndex, unit: row.Unit || "", quantity: Number(row.Quantity || 0), tasks: [] };
                    currentGroup.items.push(currentItem);
                    currentWTask = null;
                }
                // --- LEVEL 3 ---
                else if (level === 3) {
                    if (!currentItem) throw new Error(`Row "${code}" (Level 3) missing Parent Item.`);
                    currentWTask = { task_name: desc, row_index: globalRowIndex, unit: row.Unit || "", quantity: Number(row.Quantity || 0), task_wbs_ids: [] };
                    currentItem.tasks.push(currentWTask);
                }
                // --- LEVEL 4 ---
                else if (level === 4) {
                    if (!currentWTask) throw new Error(`Row "${code}" (Level 4) missing Parent Task.`);

                    const hierarchyKey = `${currentGroup.group_name}|${currentItem.item_name}|${currentWTask.task_name}|${desc}`.toLowerCase();

                    let targetWbsId = taskLookup.get(hierarchyKey);

                    if (!targetWbsId) {
                        // FAST ASSIGNMENT: Pop one ID from our pre-fetched pool
                        // No await here! Instant speed.
                        targetWbsId = newIdsPool.shift();
                    }

                    activeWbsIds.add(targetWbsId);

                    currentWTask.task_wbs_ids.push({
                        wbs_id: targetWbsId,
                        row_index: globalRowIndex
                    });

                    const qty = Number(row.Quantity || 0);
                    const unit = row.Unit || "";
                    // if (currentWTask) {
                    //     currentWTask.quantity += qty;
                    //     currentWTask.unit = unit;
                    // }
                    const duration = Number(row.Duration || 0);
                    const startDateStr = row.Start_Date ? new Date(row.Start_Date) : null;
                    let endDateStr = null;
                    if (startDateStr && duration > 0) endDateStr = addDays(startDateStr, duration);

                    const taskDoc = {
                        tender_id: tender_id,
                        wbs_id: targetWbsId,
                        row_index: globalRowIndex,
                        work_group_id: currentGroup.group_name,
                        work_item_id: currentItem.item_name,
                        work_task_id: currentWTask.task_name,
                        description: desc,
                        unit: row.Unit || "",
                        quantity: qty,
                        balance_quantity: qty,
                        duration: duration,
                        revised_duration: duration,
                        start_date: startDateStr,
                        end_date: endDateStr,
                        status: "pending"
                    };

                    leafTasksToSave.push({
                        updateOne: {
                            filter: { tender_id: tender_id, wbs_id: targetWbsId },
                            update: { $set: taskDoc },
                            upsert: true
                        }
                    });
                }
            }

            // 3. Save Structure
            let scheduleDoc = await ScheduleLiteModel.findOne({ tender_id }).session(session);
            if (scheduleDoc) {
                scheduleDoc.structure = structure;
            } else {
                scheduleDoc = new ScheduleLiteModel({ tender_id, structure });
            }
            await scheduleDoc.save({ session });

            // 4. Update/Insert Valid Tasks
            if (leafTasksToSave.length > 0) {
                await TaskModel.bulkWrite(leafTasksToSave, { session });
            }

            // 5. Cleanup Orphans
            const deleteResult = await TaskModel.deleteMany({
                tender_id: tender_id,
                wbs_id: { $nin: Array.from(activeWbsIds) }
            }).session(session);

            await session.commitTransaction();
            session.endSession();

            return {
                success: true,
                message: `Synced Schedule. Updated/Created: ${leafTasksToSave.length}, Deleted: ${deleteResult.deletedCount}`,
                data: scheduleDoc
            };

        } catch (err) {
            await session.abortTransaction();
            session.endSession();
            throw err;
        }
    }
    // =========================================================
    // 1. DATE & CALCULATION HELPERS
    // =========================================================

    // Helper: Convert Excel Serial Number to JS Date
    static excelDateToJSDate(serial) {
        // Excel base date is Dec 30, 1899
        // 86,400,000 milliseconds per day
        const utc_days = Math.floor(serial - 25569);
        const utc_value = utc_days * 86400;
        const date_info = new Date(utc_value * 1000);

        // Adjust for JS Date timezone issues by forcing UTC
        const fractional_day = serial - Math.floor(serial) + 0.0000001;
        const total_seconds = Math.floor(86400 * fractional_day);
        const seconds = total_seconds % 60;

        return new Date(Date.UTC(date_info.getUTCFullYear(), date_info.getUTCMonth(), date_info.getUTCDate(), 0, 0, 0));
    }

    // MAIN PARSER: Handles String ("27-12-2025") AND Number (46018)
    static parseDate(dateInput) {
        if (!dateInput) return null;

        // CASE A: Input is a Number (Excel Serial Date like 46018)
        if (typeof dateInput === 'number') {
            return this.excelDateToJSDate(dateInput);
        }

        // CASE B: Input is a String (CSV like "27-12-2025")
        // Try common formats. strict parsing recommended.
        const date = moment.utc(dateInput, ["DD-MM-YYYY"]).startOf('day');
        return date.isValid() ? date.toDate() : null;
    }

    // Calculate days between two dates (inclusive)
    static getDaysDiff(start, end) {
        const a = moment.utc(start).startOf('day');
        const b = moment.utc(end).startOf('day');
        // +1 because if start=Jan1 and end=Jan1, duration is 1 day
        return b.diff(a, 'days') + 1;
    }

    // Generate array of { date, quantity: 0 }
    static generateDailyEntries(startDate, endDate) {
        const daily = [];
        const current = moment.utc(startDate).startOf('day');
        const end = moment.utc(endDate).startOf('day');

        while (current <= end) {
            daily.push({
                date: current.toDate(),
                quantity: 0
            });
            current.add(1, 'days');
        }
        return daily;
    }

    // Hierarchy Calculation (Month -> Week -> Metrics)
    static calculateHierarchicalMetrics(taskData) {
        // Avoid division by zero
        const totalDuration = taskData.revised_duration || 1;
        const totalQty = taskData.quantity || 0;

        // Linear distribution: Quantity per day
        const dailyRate = totalQty / totalDuration;

        const monthMap = new Map();

        taskData.daily.forEach(day => {
            const dateObj = moment.utc(day.date);
            const monthKey = dateObj.format("MM-YYYY");
            const monthName = dateObj.format("MMMM");
            const year = dateObj.year();
            const dayNum = dateObj.date();

            // Initialize Month Bucket if new
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

            // Identify Week Bucket (Standard 7-day logic)
            let weekKey = "";
            if (dayNum <= 7) weekKey = "firstweek";
            else if (dayNum <= 14) weekKey = "secondweek";
            else if (dayNum <= 21) weekKey = "thirdweek";
            else weekKey = "fourthweek"; // All days > 21 go to 4th bucket

            // Current day's planned quantity (Linear)
            // Note: achieved is 0 initially for new schedule
            const plannedQty = dailyRate;

            // Update Week Metrics
            mData.weeks[weekKey].planned += plannedQty;
            // mData.weeks[weekKey].achieved += 0; 

            // Update Month Metrics
            mData.planned += plannedQty;
            // mData.achieved += 0; 
        });

        // Convert Map to Schema-compliant Array
        const schedule_data = [];
        monthMap.forEach((val) => {
            const weeksArray = Object.values(val.weeks).map(w => ({
                week_label: w.label,
                week_number: w.number,
                metrics: {
                    achieved_quantity: parseFloat(w.achieved.toFixed(2)),
                    planned_quantity: parseFloat(w.planned.toFixed(2)),
                    lag_quantity: parseFloat((w.planned - w.achieved).toFixed(2))
                }
            }));

            schedule_data.push({
                month_name: val.month_name,
                year: val.year,
                month_key: val.month_key,
                metrics: {
                    achieved_quantity: parseFloat(val.achieved.toFixed(2)),
                    planned_quantity: parseFloat(val.planned.toFixed(2)),
                    lag_quantity: parseFloat((val.planned - val.achieved).toFixed(2))
                },
                weeks: weeksArray
            });
        });

        return schedule_data;
    }

    // =========================================================
    // 2. BULK UPDATE SERVICE
    // =========================================================
    static async bulkUpdateSchedule(csvRows, tender_id) {
        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            // 1. Prepare Lookup Map & ID Optimization
            const existingTasks = await TaskModel.find({ tender_id }).select("wbs_id description work_group_id work_item_id work_task_id").session(session);
            const taskLookup = new Map();
            existingTasks.forEach(t => {
                const key = `${t.work_group_id?.trim()}|${t.work_item_id?.trim()}|${t.work_task_id?.trim()}|${t.description?.trim()}`.toLowerCase();
                taskLookup.set(key, t.wbs_id);
            });

            // Count New IDs for Leaf Nodes (Level 4)
            let neededIdCount = 0;
            let tempGroup = null, tempItem = null, tempTask = null;
            for (const row of csvRows) {
                const code = row.Code ? row.Code.toString().trim() : "";
                if (!code) continue;
                const level = this.getLevelFromCode(code);
                const desc = (row.Description || "Untitled").trim();
                if (level === 1) tempGroup = desc;
                else if (level === 2) tempItem = desc;
                else if (level === 3) tempTask = desc;
                else if (level === 4) {
                    const hierarchyKey = `${tempGroup}|${tempItem}|${tempTask}|${desc}`.toLowerCase();
                    if (!taskLookup.has(hierarchyKey)) neededIdCount++;
                }
            }

            const idNameWBS = "WBS";
            const newIdsPool = await IdcodeServices.generateBulkCodes(idNameWBS, neededIdCount);

            // 2. Start Main Processing
            const structure = [];
            const leafTasksToSave = [];
            const activeWbsIds = new Set();
            let globalRowIndex = 0;

            let currentGroup = null;
            let currentItem = null;
            let currentWTask = null;

            // HELPER: Calculate Data for ANY Level (L2, L3, L4)
            const processRowData = (row) => {
                const qty = Number(row.Quantity || 0);
                const unit = row.Unit || "";

                const startDate = this.parseDate(row.Start_Date);
                let duration = Number(row.Duration || 0);
                let endDate = null;

                if (startDate) {
                    if (duration > 0) endDate = addDays(startDate, duration);
                    else if (row.End_Date) {
                        endDate = this.parseDate(row.End_Date);
                        if (endDate) duration = this.getDaysDiff(startDate, endDate);
                    }
                }

                const revStart = this.parseDate(row.Revised_Start_Date) || startDate;
                const revEnd = this.parseDate(row.Revised_End_Date) || endDate;
                let revDuration = duration;
                if (revStart && revEnd) revDuration = this.getDaysDiff(revStart, revEnd);

                let daily = [];
                let schedule_data = [];

                // Only calculate metrics if dates exist in CSV
                if (revStart && revEnd) {
                    daily = this.generateDailyEntries(revStart, revEnd);
                    // Distribute Quantity Linear
                    const dailyRate = revDuration > 0 ? qty / revDuration : 0;
                    daily.forEach(d => d.quantity = dailyRate);

                    const calcContext = { quantity: qty, revised_duration: revDuration, daily: daily };
                    schedule_data = this.calculateHierarchicalMetrics(calcContext);
                }

                return {
                    unit, quantity: qty,
                    start_date: startDate, end_date: endDate, duration,
                    revised_start_date: revStart, revised_end_date: revEnd, revised_duration: revDuration,
                    lag: (revDuration - duration), status: "pending",
                    daily, schedule_data
                };
            };

            for (const row of csvRows) {
                const code = row.Code ? row.Code.toString().trim() : "";
                if (!code) continue;

                globalRowIndex++;
                const level = this.getLevelFromCode(code);
                const desc = (row.Description || "Untitled").trim();

                // --- LEVEL 1 (Group) ---
                if (level === 1) {
                    currentGroup = { group_name: desc, row_index: globalRowIndex, items: [] };
                    structure.push(currentGroup);
                    currentItem = null; currentWTask = null;
                }

                // --- LEVEL 2 (Item) - Now Processes CSV Data ---
                else if (level === 2) {
                    if (!currentGroup) throw new Error(`Row "${code}" (Level 2) missing Parent Group.`);

                    const data = processRowData(row); // Get Dates/Metrics from CSV

                    currentItem = {
                        item_name: desc,
                        row_index: globalRowIndex,
                        ...data, // Spread calculated fields (qty, daily, etc.)
                        tasks: []
                    };
                    currentGroup.items.push(currentItem);
                    currentWTask = null;
                }

                // --- LEVEL 3 (Task) - Now Processes CSV Data ---
                else if (level === 3) {
                    if (!currentItem) throw new Error(`Row "${code}" (Level 3) missing Parent Item.`);

                    const data = processRowData(row); // Get Dates/Metrics from CSV

                    currentWTask = {
                        task_name: desc,
                        row_index: globalRowIndex,
                        ...data, // Spread calculated fields
                        task_wbs_ids: []
                    };
                    currentItem.tasks.push(currentWTask);
                }

                // --- LEVEL 4 (Leaf) ---
                else if (level === 4) {
                    if (!currentWTask) throw new Error(`Row "${code}" (Level 4) missing Parent Task.`);

                    const hierarchyKey = `${currentGroup.group_name}|${currentItem.item_name}|${currentWTask.task_name}|${desc}`.toLowerCase();
                    let targetWbsId = taskLookup.get(hierarchyKey);
                    if (!targetWbsId) targetWbsId = newIdsPool.shift();

                    activeWbsIds.add(targetWbsId);
                    currentWTask.task_wbs_ids.push({ wbs_id: targetWbsId, row_index: globalRowIndex });

                    const data = processRowData(row); // Calculate Leaf Data

                    const taskDoc = {
                        tender_id, wbs_id: targetWbsId, row_index: globalRowIndex,
                        work_group_id: currentGroup.group_name, work_item_id: currentItem.item_name, work_task_id: currentWTask.task_name,
                        description: desc, balance_quantity: data.quantity,
                        ...data
                    };

                    leafTasksToSave.push({
                        updateOne: { filter: { tender_id, wbs_id: targetWbsId }, update: { $set: taskDoc }, upsert: true }
                    });
                }
            }

            // 3. Save Structure
            let scheduleDoc = await ScheduleLiteModel.findOne({ tender_id }).session(session);
            if (scheduleDoc) {
                scheduleDoc.structure = structure;
            } else {
                scheduleDoc = new ScheduleLiteModel({ tender_id, structure });
            }
            await scheduleDoc.save({ session });

            // 4. Save Tasks & Cleanup
            if (leafTasksToSave.length > 0) await TaskModel.bulkWrite(leafTasksToSave, { session });
            const deleteResult = await TaskModel.deleteMany({ tender_id, wbs_id: { $nin: Array.from(activeWbsIds) } }).session(session);

            await session.commitTransaction();
            session.endSession();

            return { success: true, message: `Synced Schedule (Independent Levels).`, data: scheduleDoc };

        } catch (err) {
            await session.abortTransaction();
            session.endSession();
            throw err;
        }
    }

    static async bulkUpdateScheduleStrict(csvRows, tender_id) {
        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            // 1. Fetch Existing Data
            const existingTasks = await TaskModel.find({ tender_id })
                .select("wbs_id description work_group_id work_item_id work_task_id quantity unit start_date end_date revised_start_date revised_end_date duration revised_duration lag daily schedule_data")
                .session(session);

            const taskLookup = new Map();
            const taskDataMap = new Map();

            existingTasks.forEach(t => {
                const key = `${t.work_group_id?.trim()}|${t.work_item_id?.trim()}|${t.work_task_id?.trim()}|${t.description?.trim()}`.toLowerCase();
                taskLookup.set(key, t.wbs_id);
                taskDataMap.set(t.wbs_id, t);
            });

            // Count New IDs
            let neededIdCount = 0;
            let tempGroup = null, tempItem = null, tempTask = null;
            for (const row of csvRows) {
                const code = row.Code ? row.Code.toString().trim() : "";
                if (!code) continue;
                const level = this.getLevelFromCode(code);
                const desc = (row.Description || "Untitled").trim();
                if (level === 1) tempGroup = desc;
                else if (level === 2) tempItem = desc;
                else if (level === 3) tempTask = desc;
                else if (level === 4) {
                    const hierarchyKey = `${tempGroup}|${tempItem}|${tempTask}|${desc}`.toLowerCase();
                    if (!taskLookup.has(hierarchyKey)) neededIdCount++;
                }
            }

            const idNameWBS = "WBS";
            const newIdsPool = await IdcodeServices.generateBulkCodes(idNameWBS, neededIdCount);

            // 2. Start Main Processing
            const structure = [];
            const leafTasksToSave = [];
            const activeWbsIds = new Set();
            let globalRowIndex = 0;

            let currentGroup = null;
            let currentItem = null;
            let currentWTask = null;

            // --- HELPER: Process Row Data ---
            const processRowData = (row, existingData = null) => {
                let qty, unit, startDate, endDate, duration, revStart, revEnd, revDuration, lag;
                let daily = [], schedule_data = [];

                if (existingData) {
                    qty = existingData.quantity;
                    unit = existingData.unit;
                } else {
                    qty = Number(row.Quantity || 0);
                    unit = row.Unit || "";
                }

                // Check DB for Dates
                const dbHasDates = existingData && existingData.start_date && existingData.end_date;

                if (dbHasDates) {
                    // --- CASE A: FREEZE EXISTING (Skip Calculation) ---
                    // Since DB has dates, we trust it completely.
                    // We copy everything directly from existingData.
                    
                    startDate = existingData.start_date;
                    endDate = existingData.end_date;
                    duration = existingData.duration;
                    revStart = existingData.revised_start_date;
                    revEnd = existingData.revised_end_date;
                    revDuration = existingData.revised_duration;
                    lag = existingData.lag;

                    // Preserve the heavy arrays too! No need to regenerate them.
                    daily = existingData.daily;
                    schedule_data = existingData.schedule_data;
                } else {
                    // Start fresh from CSV
                    startDate = this.parseDate(row.StartDate);
                    endDate = this.parseDate(row.EndDate);

                    duration = 0;
                    if (startDate && endDate) {
                        duration = this.getDaysDiff(startDate, endDate);
                    }

                    // Auto-fill Revised = Planned
                    revStart = startDate;
                    revEnd = endDate;
                    revDuration = duration;
                    lag = 0;

                    if (revStart && revEnd) {
                        daily = this.generateDailyEntries(revStart, revEnd);
                        // No splitting quantity (keep daily 0)
                        
                        const calcContext = { quantity: qty, revised_duration: revDuration, daily: daily };
                        schedule_data = this.calculateHierarchicalMetrics(calcContext);
                    }
                }

                return {
                    unit, quantity: qty,
                    start_date: startDate, end_date: endDate, duration,
                    revised_start_date: revStart, revised_end_date: revEnd, revised_duration: revDuration,
                    lag, status: "pending",
                    daily, schedule_data
                };
            };

            for (const row of csvRows) {
                const code = row.Code ? row.Code.toString().trim() : "";
                if (!code) continue;

                globalRowIndex++;
                const level = this.getLevelFromCode(code);
                const desc = (row.Description || "Untitled").trim();

                if (level === 1) {
                    currentGroup = { group_name: desc, row_index: globalRowIndex, items: [] };
                    structure.push(currentGroup);
                    currentItem = null; currentWTask = null;
                }
                else if (level === 2) {
                    if (!currentGroup) throw new Error(`Row "${code}" (Level 2) missing Parent Group.`);
                    const data = processRowData(row, null);
                    currentItem = { item_name: desc, row_index: globalRowIndex, ...data, tasks: [] };
                    currentGroup.items.push(currentItem);
                    currentWTask = null;
                }
                else if (level === 3) {
                    if (!currentItem) throw new Error(`Row "${code}" (Level 3) missing Parent Item.`);
                    const data = processRowData(row, null);
                    currentWTask = { task_name: desc, row_index: globalRowIndex, ...data, task_wbs_ids: [] };
                    currentItem.tasks.push(currentWTask);
                }
                else if (level === 4) {
                    if (!currentWTask) throw new Error(`Row "${code}" (Level 4) missing Parent Task.`);

                    // *** CONDITION CHECK: IF L3 HAS CHILDREN, OMIT L3 DATES ***
                    // We found a child (L4), so the parent (L3 - currentWTask) must act as a container.
                    // We explicitly wipe any dates we assigned to it in the previous step.
                    if (currentWTask) {
                        currentWTask.start_date = null;
                        currentWTask.end_date = null;
                        currentWTask.duration = 0;
                        currentWTask.revised_start_date = null;
                        currentWTask.revised_end_date = null;
                        currentWTask.revised_duration = 0;
                        currentWTask.daily = [];
                        currentWTask.schedule_data = [];
                        currentWTask.lag = 0;
                        // Note: We leave Quantity/Unit alone as per your previous instruction
                    }

                    const hierarchyKey = `${currentGroup.group_name}|${currentItem.item_name}|${currentWTask.task_name}|${desc}`.toLowerCase();
                    let targetWbsId = taskLookup.get(hierarchyKey);

                    const existingDoc = targetWbsId ? taskDataMap.get(targetWbsId) : null;

                    if (!targetWbsId) targetWbsId = newIdsPool.shift();

                    activeWbsIds.add(targetWbsId);
                    currentWTask.task_wbs_ids.push({ wbs_id: targetWbsId, row_index: globalRowIndex });

                    // PASS EXISTING DOC to check dates
                    const data = processRowData(row, existingDoc); 

                    const taskDoc = {
                        tender_id, wbs_id: targetWbsId, row_index: globalRowIndex,
                        work_group_id: currentGroup.group_name, work_item_id: currentItem.item_name, work_task_id: currentWTask.task_name,
                        description: desc, balance_quantity: data.quantity,
                        ...data
                    };

                    leafTasksToSave.push({
                        updateOne: { filter: { tender_id, wbs_id: targetWbsId }, update: { $set: taskDoc }, upsert: true }
                    });
                }
            }

            // ... (Save Logic same as before) ...
            
            let scheduleDoc = await ScheduleLiteModel.findOne({ tender_id }).session(session);
            if (scheduleDoc) {
                scheduleDoc.structure = structure;
            } else {
                scheduleDoc = new ScheduleLiteModel({ tender_id, structure });
            }
            await scheduleDoc.save({ session });

            if (leafTasksToSave.length > 0) await TaskModel.bulkWrite(leafTasksToSave, { session });
            const deleteResult = await TaskModel.deleteMany({ tender_id, wbs_id: { $nin: Array.from(activeWbsIds) } }).session(session);

            await session.commitTransaction();
            session.endSession();

            return { success: true, message: `Synced Schedule.`, data: scheduleDoc };

        } catch (err) {
            await session.abortTransaction();
            session.endSession();
            throw err;
        }
    }


    static async getPopulatedSchedule(tender_id) {
        // 1. Fetch the Structure
        const scheduleDoc = await ScheduleLiteModel.findOne({ tender_id }).lean();

        if (!scheduleDoc) {
            throw new Error("Schedule not found");
        }

        // 2. Extract all WBS IDs from the nested structure
        const allWbsIds = [];

        scheduleDoc.structure.forEach(group => {
            group.items.forEach(item => {
                item.tasks.forEach(taskContainer => {
                    if (Array.isArray(taskContainer.task_wbs_ids)) {
                        // FIX 1: Map over the objects to extract just the wbs_id string
                        const ids = taskContainer.task_wbs_ids.map(ref => ref.wbs_id);
                        allWbsIds.push(...ids);
                    }
                });
            });
        });

        // 3. Fetch all related Tasks in ONE database call
        const taskDocuments = await TaskModel.find({
            tender_id: tender_id,
            wbs_id: { $in: allWbsIds }
        }).lean();

        // 4. Create a Lookup Map for O(1) access
        const taskMap = new Map();
        taskDocuments.forEach(task => {
            taskMap.set(task.wbs_id, task);
        });

        // 5. Re-assemble: Inject Task objects back into the Structure
        scheduleDoc.structure.forEach(group => {
            group.items.forEach(item => {
                item.tasks.forEach(taskContainer => {

                    // FIX 2: Iterate over the reference objects ({ wbs_id, row_index })
                    const populatedTasks = taskContainer.task_wbs_ids.map(ref => {
                        const fullTask = taskMap.get(ref.wbs_id);
                        if (!fullTask) return null;

                        // Combine the Structure data (row_index) with the Heavy Task data
                        return {
                            wbs_id: fullTask.wbs_id,
                            description: fullTask.description,
                            unit: fullTask.unit,
                            quantity: fullTask.quantity,

                            // Important: Pass the row_index from the structure to the frontend
                            row_index: ref.row_index
                        };
                    }).filter(t => t !== null);

                    taskContainer.task_wbs_ids = populatedTasks;
                });
            });
        });

        return scheduleDoc;
    }


}

export default ScheduleLiteService;