import ScheduleModel from "./schedule.model.js";
import IdcodeServices from "../../idcode/idcode.service.js";
import mongoose from "mongoose";
import moment from "moment";

class ScheduleService {

    // ============================================================
    //  UTC DATE HELPERS (Prevents Timezone Shifts)
    // ============================================================

    /**
     * Forces any input (String/Date) to become a UTC Midnight Date Object.
     * Example: "2026-01-05" -> 2026-01-05T00:00:00.000Z
     */
    static parseToUTC(dateInput) {
        if (!dateInput) return null;
        // moment.utc() treats the input as UTC. startOf('day') sets time to 00:00:00.
        return moment.utc(dateInput).startOf('day').toDate();
    }

    /**
     * Calculates days difference strictly in UTC to avoid DST/Timezone gaps.
     */
    static getDaysDiff(start, end) {
        const a = moment.utc(start).startOf('day');
        const b = moment.utc(end).startOf('day');
        // add 1 for inclusive duration (e.g., 5th to 5th is 1 day)
        return b.diff(a, 'days') + 1;
    }

    /**
     * Generates an array of daily objects from Start to End (UTC).
     * Preserves existing quantities if dates overlap.
     */
    static generateDailyArray(startDate, endDate, existingDaily = []) {
        const start = moment.utc(startDate).startOf('day');
        const end = moment.utc(endDate).startOf('day');
        const days = end.diff(start, 'days') + 1;

        const newDaily = [];
        const existingMap = new Map();

        // 1. Map existing data using a safe YYYY-MM-DD key (UTC)
        existingDaily.forEach(d => {
            const dateKey = moment.utc(d.date).format('YYYY-MM-DD');
            existingMap.set(dateKey, d.quantity);
        });

        // 2. Generate new range
        for (let i = 0; i < days; i++) {
            // Clone start to avoid mutation, add days
            const current = moment.utc(start).add(i, 'days');
            const dateKey = current.format('YYYY-MM-DD');

            newDaily.push({
                date: current.toDate(), // Saves as T00:00:00.000Z
                quantity: existingMap.has(dateKey) ? existingMap.get(dateKey) : 0
            });
        }
        return newDaily;
    }

    /**
     * Calculates Hierarchical Data (Month -> Weeks) handling multi-month durations.
     * Uses UTC to ensure days fall into the correct Month bucket.
     */
    static calculateHierarchicalMetrics(item) {
        // Prevent division by zero
        const dailyRate = item.revised_duration > 0 ? (item.quantity / item.revised_duration) : 0;

        const monthMap = new Map();

        item.daily.forEach(day => {
            // STRICT UTC PARSING for bucketing
            const dateObj = moment.utc(day.date);
            const monthKey = dateObj.format("MM-YYYY");
            const monthName = dateObj.format("MMMM");
            const year = dateObj.year();
            const dayNum = dateObj.date();

            // Initialize Month Bucket
            if (!monthMap.has(monthKey)) {
                monthMap.set(monthKey, {
                    month_name: monthName,
                    year: year,
                    month_key: monthKey,
                    achieved: 0,
                    planned: 0,
                    weeks: {
                        firstweek: { label: "firstweek", number: 1, achieved: 0, planned: 0 },
                        secondweek: { label: "secondweek", number: 2, achieved: 0, planned: 0 },
                        thirdweek: { label: "thirdweek", number: 3, achieved: 0, planned: 0 },
                        fourthweek: { label: "fourthweek", number: 4, achieved: 0, planned: 0 }
                    }
                });
            }

            const mData = monthMap.get(monthKey);

            // Identify Week Bucket (1-7, 8-14, 15-21, 22-End)
            let weekKey = "";
            if (dayNum <= 7) weekKey = "firstweek";
            else if (dayNum <= 14) weekKey = "secondweek";
            else if (dayNum <= 21) weekKey = "thirdweek";
            else weekKey = "fourthweek";

            const qty = day.quantity || 0;

            // Add to Week
            mData.weeks[weekKey].achieved += qty;
            mData.weeks[weekKey].planned += dailyRate;

            // Add to Month Total
            mData.achieved += qty;
            mData.planned += dailyRate;
        });

        // Convert Map to Schema Array
        const schedule_data = [];
        monthMap.forEach((val) => {
            const weeksArray = Object.values(val.weeks).map(w => {
                const planned = parseFloat(w.planned.toFixed(2));
                const achieved = parseFloat(w.achieved.toFixed(2));
                return {
                    week_label: w.label,
                    week_number: w.number,
                    metrics: {
                        achieved_quantity: achieved,
                        planned_quantity: planned,
                        lag_quantity: planned > 0 ? parseFloat((planned - achieved).toFixed(2)) : 0
                    }
                };
            });

            const mPlanned = parseFloat(val.planned.toFixed(2));
            const mAchieved = parseFloat(val.achieved.toFixed(2));

            schedule_data.push({
                month_name: val.month_name,
                year: val.year,
                month_key: val.month_key,
                metrics: {
                    achieved_quantity: mAchieved,
                    planned_quantity: mPlanned,
                    lag_quantity: mPlanned > 0 ? parseFloat((mPlanned - mAchieved).toFixed(2)) : 0
                },
                weeks: weeksArray
            });
        });

        return schedule_data;
    }

    // ============================================================
    //  MAIN LOGIC: UPDATE SCHEDULE
    // ============================================================

    static async updateSchedule(tenderId, payload) {
        try {
            const { daily_updates, new_start_dates, revised_end_dates } = payload;
            const schedule = await ScheduleModel.findOne({ tender_id: tenderId });

            if (!schedule) throw new Error("Schedule not found");

            for (let item of schedule.items) {
                let isModified = false;

                // --- 1. Handle Date Shifts ---
                const newStartStr = new_start_dates && new_start_dates[item.wbs_id];
                const newRevisedEndStr = revised_end_dates && revised_end_dates[item.wbs_id];

                if (newStartStr || newRevisedEndStr) {
                    // FIX: Force inputs to UTC Midnight immediately
                    const effectiveStart = newStartStr ? this.parseToUTC(newStartStr) : item.start_date;
                    const effectiveRevisedEnd = newRevisedEndStr ? this.parseToUTC(newRevisedEndStr) : item.revised_end_date;
                    const originalEnd = item.end_date;

                    // A. Update Start & Original Duration
                    if (newStartStr) {
                        item.start_date = effectiveStart;
                        const newOrgDuration = this.getDaysDiff(effectiveStart, originalEnd);
                        item.duration = newOrgDuration > 0 ? newOrgDuration : 0;
                    }

                    // B. Update Revised End
                    if (newRevisedEndStr) {
                        item.revised_end_date = effectiveRevisedEnd;
                    }

                    // C. Update Revised Duration (Time difference between Start and Revised End)
                    const newRevDuration = this.getDaysDiff(effectiveStart, effectiveRevisedEnd);
                    item.revised_duration = newRevDuration > 0 ? newRevDuration : 0;

                    // D. Regenerate Daily Array (UTC Safe)
                    item.daily = this.generateDailyArray(effectiveStart, effectiveRevisedEnd, item.daily);
                    isModified = true;
                }

                // --- 2. Handle Daily Quantity Updates ---
                if (daily_updates) {
                    item.daily.forEach(dayRecord => {
                        // Key Matching: We use ISO String for exact match or Date Key
                        // Frontend likely sends ISO string. We should check if that ISO string matches.

                        // Option A: Exact String Match (if frontend sends exact UTC ISO)
                        const keyISO = `${item.wbs_id}-${dayRecord.date.toISOString()}`;

                        // Option B: Date-Key Match (Safer if frontend sends local time ISO)
                        // This reconstructs the key as "WBS-YYYY-MM-DD" style check if needed, 
                        // but sticking to your current key format:

                        if (daily_updates.hasOwnProperty(keyISO)) {
                            const newQty = parseFloat(daily_updates[keyISO]);
                            if (!isNaN(newQty)) {
                                dayRecord.quantity = newQty;
                                isModified = true;
                            }
                        }
                    });
                }

                // --- 3. Recalculate Aggregates ---
                if (isModified) {
                    const totalExecuted = item.daily.reduce((sum, d) => sum + (d.quantity || 0), 0);
                    item.executed_quantity = parseFloat(totalExecuted.toFixed(2));
                    item.balance_quantity = parseFloat((item.quantity - item.executed_quantity).toFixed(2));

                    // Status
                    if (item.executed_quantity >= item.quantity) item.status = "completed";
                    else if (item.executed_quantity > 0) item.status = "inprogress";
                    else item.status = "pending";

                    // Lag Update
                    if (item.revised_duration !== undefined && item.duration !== undefined) {
                        item.lag = item.revised_duration - item.duration;
                    }

                    // Calculate Hierarchy
                    item.schedule_data = this.calculateHierarchicalMetrics(item);
                }
            }

            await schedule.save();
            return schedule;

        } catch (error) {
            throw error;
        }
    }

    // ============================================================
    //  CSV & GETTER METHODS
    // ============================================================

    // Bulk Insert (CSV) - Initial Creation
    static async bulkInsert(csvRows, createdByUser, tender_id) {
        const session = await mongoose.startSession();
        session.startTransaction();
        try {
            const idNameWBS = "WBS";
            await IdcodeServices.addIdCode(idNameWBS, "WBS");
            const items = [];

            for (const row of csvRows) {
                const wbs_id = await IdcodeServices.generateCode(idNameWBS);
                items.push({
                    wbs_id,
                    description: row.description || "",
                    unit: row.unit || "",
                    quantity: Number(row.quantity || 0),
                    executed_quantity: 0,
                    balance_quantity: Number(row.quantity || 0),
                    duration: 0,
                    revised_duration: 0,
                    start_date: null,
                    end_date: null,
                    revised_end_date: null,
                    lag: 0,
                    status: "pending",
                    daily: [],
                    schedule_data: []
                });
            }

            let schedule = await ScheduleModel.findOne({ tender_id }).session(session);
            if (schedule) {
                schedule.items = items;
            } else {
                schedule = new ScheduleModel({ tender_id, items });
            }

            await schedule.save({ session });
            await session.commitTransaction();
            session.endSession();
            return schedule;
        } catch (err) {
            await session.abortTransaction();
            session.endSession();
            throw err;
        }
    }
    // --- Bulk Update Dates from CSV (Fill Missing Only) ---
    static async bulkUpdateSchedule(csvRows, tender_id) {
        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            const schedule = await ScheduleModel.findOne({ tender_id }).session(session);
            if (!schedule) throw new Error(`Schedule not found for tender_id: ${tender_id}`);

            for (const row of csvRows) {
                const wbs_id = row.wbs_id?.trim();
                if (!wbs_id) continue;

                const itemIndex = schedule.items.findIndex((i) => i.wbs_id === wbs_id);
                if (itemIndex === -1) continue;

                const item = schedule.items[itemIndex];

                // *** NEW CHECK: Skip if dates already exist ***
                // If the item already has a start date, we assume it's set up and shouldn't be touched by bulk upload.
                if (item.start_date && item.end_date && item.revised_end_date) {
                    continue;
                }

                // Parse Dates using UTC Helper
                const startDate = this.parseDate(row.start_date);
                const endDate = this.parseDate(row.end_date);
                const revisedEndDate = this.parseDate(row.revised_end_date);

                if (startDate && endDate && revisedEndDate) {
                    item.start_date = startDate;
                    item.end_date = endDate;
                    item.revised_end_date = revisedEndDate;

                    item.duration = this.getDaysDiff(startDate, endDate);
                    item.revised_duration = this.getDaysDiff(startDate, revisedEndDate);
                    item.lag = item.revised_duration - item.duration;

                    item.daily = this.generateDailyEntries(startDate, revisedEndDate);
                    item.schedule_data = this.calculateHierarchicalMetrics(item);
                    schedule.items[itemIndex] = item;
                }
            }

            await schedule.save({ session });
            await session.commitTransaction();
            session.endSession();
            return schedule;
        } catch (err) {
            await session.abortTransaction();
            session.endSession();
            throw err;
        }
    }

    // --- CSV Date Parser (UTC) ---
    static parseDate(dateString) {
        if (!dateString) return null;
        // Treats input as UTC, ignoring local time
        const date = moment.utc(dateString, ["DD-MM-YYYY"]).startOf('day');
        return date.isValid() ? date.toDate() : null;
    }

    static generateDailyEntries(startDate, endDate) {
        const daily = [];
        const current = moment.utc(startDate).startOf('day');
        const end = moment.utc(endDate).startOf('day');

        while (current <= end) {
            daily.push({ date: current.toDate(), quantity: 0 });
            current.add(1, 'days');
        }
        return daily;
    }

    // --- Getters ---
    static async getSchedule(tender_id) {
        return await ScheduleModel.findOne({ tender_id });
    }

    static async getScheduleforcsv(tender_id) {
        const schedule = await ScheduleModel.findOne({ tender_id });
        if (!schedule) return [];
        return schedule.items.map(item => ({
            wbs_id: item.wbs_id,
            description: item.description,
            unit: item.unit,
            quantity: item.quantity,
            start_date: item.start_date,
            end_date: item.end_date,
            revised_end_date: item.revised_end_date,
        }));
    }

    static async getDailySchedule(tender_id) {
        const schedule = await ScheduleModel.findOne({ tender_id });
        if (!schedule) return [];
        return schedule.items.map(item => ({
            wbs_id: item.wbs_id,
            description: item.description,
            unit: item.unit,
            quantity: item.quantity,
            start_date: item.start_date,
            end_date: item.end_date,
            revised_end_date: item.revised_end_date,
            executed_quantity: item.executed_quantity,
            balance_quantity: item.balance_quantity,
            status: item.status,
            lag: item.lag,
            daily: item.daily,
            schedule_data: item.schedule_data
        }));
    }
}

export default ScheduleService;