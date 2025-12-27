import mongoose from "mongoose";
import { addDays } from "date-fns";
import IdcodeServices from "../../../idcode/idcode.service.js";
import ScheduleLiteModel from "./schedulelite.model.js"; 
import TaskModel from "../task/task.model.js";

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
            // 1. Prepare Lookup Map for Existing Tasks (To reuse IDs)
            // Key: "Group|Item|Task|Description" -> Value: "WBS-123"
            const existingTasks = await TaskModel.find({ tender_id }).select("wbs_id description work_group_id work_item_id work_task_id").session(session);
            
            const taskLookup = new Map();
            existingTasks.forEach(t => {
                const key = `${t.work_group_id?.trim()}|${t.work_item_id?.trim()}|${t.work_task_id?.trim()}|${t.description?.trim()}`.toLowerCase();
                taskLookup.set(key, t.wbs_id);
            });

            // 2. Start Fresh (Sync Strategy)
            // We rebuild the structure array from the CSV. Any group/item NOT in CSV will naturally be dropped.
            const structure = []; 
            const leafTasksToSave = []; 
            const activeWbsIds = new Set(); // Track IDs present in this upload

            // Context Trackers
            let currentGroup = null; 
            let currentItem = null;  
            let currentWTask = null; 

            const idNameWBS = "WBS";
            await IdcodeServices.addIdCode(idNameWBS, "WBS");

            for (const row of csvRows) {
                const code = row.Code ? row.Code.toString().trim() : "";
                if (!code) continue;

                const level = this.getLevelFromCode(code);
                const desc = (row.Description || "Untitled").trim();

                // --- LEVEL 1: Work Group ---
                if (level === 1) {
                    currentGroup = { group_name: desc, items: [] };
                    structure.push(currentGroup);
                    currentItem = null; currentWTask = null;
                }

                // --- LEVEL 2: Work Item ---
                else if (level === 2) {
                    if (!currentGroup) throw new Error(`Row "${code}" (Level 2) missing Parent Group.`);
                    currentItem = { item_name: desc,unit: row.Unit || "", quantity: Number(row.Quantity || 0), tasks: [] };
                    currentGroup.items.push(currentItem);
                    currentWTask = null;
                }

                // --- LEVEL 3: Task Container ---
                else if (level === 3) {
                    if (!currentItem) throw new Error(`Row "${code}" (Level 3) missing Parent Item.`);
                   // currentWTask = { task_name: desc,unit: row.Unit || "", quantity: Number(row.Quantity || 0), task_wbs_ids: [] };
                   currentWTask = { 
                        task_name: desc, 
                        unit: row.Unit || "", 
                        quantity: 0, // Start at 0
                        task_wbs_ids: [] 
                    };
                   currentItem.tasks.push(currentWTask);
                }

                // --- LEVEL 4: Leaf Task ---
                else if (level === 4) {
                    if (!currentWTask) throw new Error(`Row "${code}" (Level 4) missing Parent Task.`);

                    // A. Determine WBS ID (Reuse or Create)
                    const hierarchyKey = `${currentGroup.group_name}|${currentItem.item_name}|${currentWTask.task_name}|${desc}`.toLowerCase();
                    
                    let targetWbsId = taskLookup.get(hierarchyKey);
                    
                    if (!targetWbsId) {
                        // New Task found in CSV
                        targetWbsId = await IdcodeServices.generateCode(idNameWBS);
                    }
                    
                    // Mark ID as "Active" so we don't delete it later
                    activeWbsIds.add(targetWbsId);
                    
                    // Link to Structure
                    currentWTask.task_wbs_ids.push(targetWbsId);

                    // B. Prepare Data
                    const qty = Number(row.Quantity || 0);
                    const unit = row.Unit || "";
                    if (currentWTask) {
                        currentWTask.quantity += qty;
                        currentWTask.unit = unit;
                    }
                    const duration = Number(row.Duration || 0);
                    const startDateStr = row.Start_Date ? new Date(row.Start_Date) : null;
                    let endDateStr = null;
                    if (startDateStr && duration > 0) endDateStr = addDays(startDateStr, duration);

                    const taskDoc = {
                        tender_id: tender_id,
                        wbs_id: targetWbsId,
                        
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

            // 3. Save Structure (Completely Overwrite)
            // This effectively removes any Groups/Items that were deleted from the CSV
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

            // 5. CLEANUP ORPHANS (The Delete Logic)
            // Any task in the DB for this tender that is NOT in 'activeWbsIds' set was removed from the CSV.
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

    static async getPopulatedSchedule(tender_id) {
        // 1. Fetch the Structure (Use .lean() for performance and mutability)
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
                        allWbsIds.push(...taskContainer.task_wbs_ids);
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
        // Key: wbs_id -> Value: Task Object
        const taskMap = new Map();
        taskDocuments.forEach(task => {
            taskMap.set(task.wbs_id, task);
        });

        // 5. Re-assemble: Inject Task objects back into the Structure
        scheduleDoc.structure.forEach(group => {
            group.items.forEach(item => {
                item.tasks.forEach(taskContainer => {
                    // Replace array of Strings (IDs) with array of Objects (Task Data)
                    // const populatedTasks = taskContainer.task_wbs_ids.map(id => {
                    //     return taskMap.get(id) || null; // Return task or null if missing
                    // }).filter(t => t !== null); // Remove nulls

                    // Create a new field 'tasks_data' or overwrite 'task_wbs_ids'
                    // Overwriting is usually cleaner for the frontend

                    const populatedTasks = taskContainer.task_wbs_ids.map(id => {
                        const fullTask = taskMap.get(id);
                        if (!fullTask) return null;
                        
                        // Extract specific fields
                        return {
                            wbs_id: fullTask.wbs_id,
                            description: fullTask.description,
                            unit: fullTask.unit,
                            quantity: fullTask.quantity
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