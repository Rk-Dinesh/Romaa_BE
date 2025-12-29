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

            const idNameWBS = "WorkBreakdownStructure";
            const idcode = "WBS";
            await IdcodeServices.addIdCode(idNameWBS, idcode);
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
            // 1. Fetch Existing Data (Added 'predecessor' to the select list)
            const existingTasks = await TaskModel.find({ tender_id })
                .select("wbs_id description work_group_id work_item_id work_task_id quantity unit start_date end_date revised_start_date revised_end_date duration revised_duration lag daily schedule_data predecessor predecessor_actual")
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
                let qty, unit, startDate, endDate, duration, revStart, revEnd, revDuration, lag, predecessor, predecessor_actual;
                let daily = [], schedule_data = [];

                if (existingData) {
                    qty = existingData.quantity;
                    unit = existingData.unit;
                    // Freeze Predecessor if it exists in DB
                    predecessor = existingData.predecessor || row.Predecessor || "";
                } else {
                    qty = Number(row.Quantity || 0);
                    unit = row.Unit || "";
                    // New Task: Take Predecessor from CSV
                    predecessor = row.Predecessor || "";
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
                    predecessor_actual = row.Predecessor || "";

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
                    unit, quantity: qty, predecessor, predecessor_actual,
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
                        currentWTask.predecessor = "";
                        currentWTask.predecessor_actual = ""; // Clear predecessor on parent if it becomes a summary
                    }

                    const hierarchyKey = `${currentGroup.group_name}|${currentItem.item_name}|${currentWTask.task_name}|${desc}`.toLowerCase();
                    let targetWbsId = taskLookup.get(hierarchyKey);
                    const existingDoc = targetWbsId ? taskDataMap.get(targetWbsId) : null;

                    if (!targetWbsId) targetWbsId = newIdsPool.shift();

                    activeWbsIds.add(targetWbsId);
                    currentWTask.task_wbs_ids.push({ wbs_id: targetWbsId, row_index: globalRowIndex });

                    const data = processRowData(row, existingDoc);

                    const taskDoc = {
                        tender_id, wbs_id: targetWbsId, row_index: globalRowIndex,
                        work_group_id: currentGroup.group_name, work_item_id: currentItem.item_name, work_task_id: currentWTask.task_name,
                        description: desc, balance_quantity: data.quantity,
                        ...data // predecessor is spread here
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

    static async getPopulatedScheduleAll(tender_id) {
        // 1. Fetch the Structure
        const scheduleDoc = await ScheduleLiteModel.findOne({ tender_id }).lean();

        if (!scheduleDoc) {
            throw new Error("Schedule not found");
        }

        // 2. Extract ALL IDs
        const allIdsToFetch = [];

        scheduleDoc.structure.forEach(group => {
            group.items.forEach(item => {
                if (item.work_group_id) allIdsToFetch.push(item.work_group_id);

                item.tasks.forEach(taskContainer => {
                    if (Array.isArray(taskContainer.task_wbs_ids)) {
                        const ids = taskContainer.task_wbs_ids.map(ref => ref.wbs_id);
                        allIdsToFetch.push(...ids);
                    }
                });
            });
        });

        // 3. Fetch Data (Excluding heavy fields from DB to save memory)
        const taskDocuments = await TaskModel.find({
            tender_id: tender_id,
            wbs_id: { $in: allIdsToFetch }
        })
            .select("-daily -schedule_data")
            .lean();

        // 4. Create Lookup Map
        const taskMap = new Map();
        taskDocuments.forEach(doc => {
            taskMap.set(doc.wbs_id, doc);
        });

        // 5. Re-assemble & CLEANUP
        scheduleDoc.structure.forEach(group => {
            group.items.forEach(item => {

                // --- POPULATE LEVEL 2 (ITEM) ---
                const fullItem = taskMap.get(item.work_group_id);
                if (fullItem) {
                    item.item_name = fullItem.description || item.item_name;
                    item.unit = fullItem.unit;
                    item.quantity = fullItem.quantity;
                    item.executed_quantity = fullItem.executed_quantity;
                    item.balance_quantity = fullItem.balance_quantity;
                    item.start_date = fullItem.start_date;
                    item.end_date = fullItem.end_date;
                    item.revised_start_date = fullItem.revised_start_date;
                    item.revised_end_date = fullItem.revised_end_date;
                    item.duration = fullItem.duration;
                    item.revised_duration = fullItem.revised_duration;
                    item.lag = fullItem.lag;
                    item.predecessor = fullItem.predecessor;
                    item.predecessor_actual = fullItem.predecessor_actual;
                }

                // *** FIX: Explicitly remove Schema Defaults ***
                delete item.daily;
                delete item.schedule_data;

                // --- POPULATE LEVEL 4 (TASKS) ---
                item.tasks.forEach(taskContainer => {

                    // *** FIX: Remove Schema Defaults from Level 3 Container ***
                    delete taskContainer.daily;
                    delete taskContainer.schedule_data;

                    const populatedTasks = taskContainer.task_wbs_ids.map(ref => {
                        const fullTask = taskMap.get(ref.wbs_id);
                        if (!fullTask) return null;

                        // Return clean object (No daily/schedule_data)
                        return {
                            wbs_id: fullTask.wbs_id,
                            description: fullTask.description,
                            unit: fullTask.unit,
                            quantity: fullTask.quantity,
                            executed_quantity: fullTask.executed_quantity,
                            balance_quantity: fullTask.balance_quantity,
                            row_index: ref.row_index,
                            start_date: fullTask.start_date,
                            end_date: fullTask.end_date,
                            revised_start_date: fullTask.revised_start_date,
                            revised_end_date: fullTask.revised_end_date,
                            duration: fullTask.duration,
                            revised_duration: fullTask.revised_duration,
                            lag: fullTask.lag,
                            predecessor: fullTask.predecessor,
                            predecessor_actual: fullTask.predecessor_actual
                        };
                    }).filter(t => t !== null);

                    taskContainer.task_wbs_ids = populatedTasks;
                });
            });
        });

        return scheduleDoc;
    }



    // --- Helper: Calculate Start Date based on Parent & Rule ---

    static calculateStartDate(parentTask, type, lag) {
        if (!parentTask || !parentTask.revised_start_date || !parentTask.revised_end_date) return null;

        let baseDate;
        if (type === 'SS') {
            baseDate = new Date(parentTask.revised_start_date);
        } else {
            // Default FS: Parent End Date + 1 Day (Standard Project Logic) + Lag
            // Based on your example: 3FS+1 = End Date + 1. 
            // So Base is EndDate.
            baseDate = new Date(parentTask.revised_end_date);
            // In standard FS, if End is Jan 4, Start is Jan 5. 
            // Your example says: End Jan 4. 3FS+1 -> Jan 6. 
            // This implies: (End Date) + (1 standard buffer) + (Lag)
            // Or strictly: End Date + Lag. 
            // Let's stick strictly to your math: 
            // "3FS+1 = 3rd row end date (Jan 05) + 1 day = Jan 06"
            // So Formula = ParentEnd + Lag.
        }

        // Apply Lag (and standard FS offset if implied, but using your strict example logic)
        // If FS and Lag is 1: End + 1.
        // If FS and Lag is 0: End + 0? Usually FS means "Start AFTER Finish". 
        // I will assume logic: Date = Base + Lag.
        // Note: For FS, usually Start = End + 1 + Lag. 
        // Your Ex: End=Jan4. FS+1=Jan6. Diff=2 days. 
        // This suggests: Start = End + 1 (next day) + Lag.

        let calculatedDate = new Date(baseDate);

        // Logic adjustment based on "End Date + Lag" description in prompt:
        // "3FS+2 = 3rd row end date after date + 2 days"
        // If End is Jan 6. Jan 6 + 2 days = Jan 8.

        calculatedDate = addDays(calculatedDate, lag);

        // If FS, commonly the "End Date" is the last working day. The next task starts the next day + lag.
        // If your system stores End Date as Inclusive, we usually add 1 day for FS baseline.
        // However, I will strictly follow: newStart = addDays(ReferenceDate, Lag).

        return calculatedDate;
    }
    
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
                        if (predInfo.type === 'FS') offset += 1;

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
                        if (predInfo.type === 'FS') offset += 1;

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

export default ScheduleLiteService;