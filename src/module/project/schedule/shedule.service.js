import mongoose from "mongoose";
import IdcodeServices from "../../idcode/idcode.service.js";
import ScheduleModel from "./schedule.model.js";
import moment from "moment";

class ScheduleService {

    static async bulkInsert(csvRows, createdByUser, tender_id) {
        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            const idNameWBS = "WBS";
            const idCodeWBS = "WBS";
            await IdcodeServices.addIdCode(idNameWBS, idCodeWBS);

            const items = [];

            for (const row of csvRows) {
                const wbs_id = await IdcodeServices.generateCode(idNameWBS);
                if (!wbs_id) throw new Error("Failed to generate WBS ID");

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
                    weekly: {
                        firstweek: {},
                        secondweek: {},
                        thirdweek: {},
                        fourthweek: {},
                    },
                    monthly: {
                        planned_quantity: 0,
                        achieved_quantity: 0,
                    },
                });
            }

            let schedule = await ScheduleModel.findOne({ tender_id }).session(session);

            if (schedule) {
                schedule.items = items;
            } else {
                schedule = new ScheduleModel({
                    tender_id,
                    items,
                });
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

    static async bulkUpdateSchedule(csvRows, tender_id) {
        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            const schedule = await ScheduleModel.findOne({ tender_id }).session(session);

            if (!schedule) {
                throw new Error(`Schedule not found for tender_id: ${tender_id}`);
            }

            for (const row of csvRows) {
                const wbs_id = row.wbs_id?.trim();

                if (!wbs_id) {
                    throw new Error("wbs_id is required in CSV");
                }

                const itemIndex = schedule.items.findIndex((i) => i.wbs_id === wbs_id);

                if (itemIndex === -1) {
                    throw new Error(`WBS ${wbs_id} is not found`);
                }

                const item = schedule.items[itemIndex];

                const startDate = this.parseDate(row.start_date);
                const endDate = this.parseDate(row.end_date);
                const revisedEndDate = this.parseDate(row.revised_end_date);

                if (!startDate || !endDate || !revisedEndDate) {
                    throw new Error(`Invalid date format for WBS ${wbs_id}. Expected MM/DD/YYYY format.`);
                }

                const duration = this.calculateDaysDifference(startDate, endDate);
                const revised_duration = this.calculateDaysDifference(startDate, revisedEndDate);
                const lag = this.calculateDaysDifference(endDate, revisedEndDate);

                item.start_date = startDate;
                item.end_date = endDate;
                item.revised_end_date = revisedEndDate;
                item.duration = duration;
                item.revised_duration = revised_duration;
                item.lag = lag;

                item.daily = this.generateDailyEntries(startDate, revisedEndDate);

                const workingQuantityPerDay = item.quantity / revised_duration;

                item.weekly = this.calculateWeeklyMetrics(
                    item.daily,
                    startDate,
                    revisedEndDate,
                    workingQuantityPerDay
                );

                item.monthly = {
                    planned_quantity: Number(item.quantity.toFixed(2)),
                    achieved_quantity: 0,
                };

                schedule.items[itemIndex] = item;
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

    static parseDate(dateString) {
        if (!dateString) return null;

        const trimmed = dateString.trim();
        const parts = trimmed.split("/");

        if (parts.length !== 3) {
            return null;
        }

        const month = parseInt(parts[0], 10);
        const day = parseInt(parts[1], 10);
        const year = parseInt(parts[2], 10);

        if (isNaN(month) || isNaN(day) || isNaN(year)) {
            return null;
        }

        // Pad month and day with leading zeros
        const monthStr = String(month).padStart(2, '0');
        const dayStr = String(day).padStart(2, '0');

        // Create ISO date string in UTC to avoid timezone issues
        const isoString = `${year}-${monthStr}-${dayStr}T00:00:00Z`;
        const date = new Date(isoString);

        // Verify the date is valid
        if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
            return null;
        }

        return date;
    }

    static calculateDaysDifference(startDate, endDate) {
        const start = new Date(startDate);
        const end = new Date(endDate);

        // Convert to UTC and remove time portion for accurate comparison
        start.setUTCHours(0, 0, 0, 0);
        end.setUTCHours(0, 0, 0, 0);

        const timeDifference = end - start;
        const daysDifference = Math.floor(timeDifference / (1000 * 60 * 60 * 24));

        // Add 1 to make it inclusive (include both start and end dates)
        return daysDifference + 1;
    }



    static generateDailyEntries(startDate, endDate) {
        const daily = [];
        const current = new Date(startDate);

        while (current <= endDate) {
            daily.push({
                date: new Date(current),
                quantity: 0,
            });
            current.setDate(current.getDate() + 1);
        }

        return daily;
    }

    static calculateWeeklyMetrics(daily, startDate, endDate, workingQuantityPerDay) {
        const weekBoundaries = {
            firstweek: { start: 1, end: 7 },
            secondweek: { start: 8, end: 14 },
            thirdweek: { start: 15, end: 21 },
            fourthweek: { start: 22, end: 31 },
        };

        const weekly = {
            firstweek: { achieved_quantity: 0, planned_quantity: 0, lag_quantity: 0 },
            secondweek: { achieved_quantity: 0, planned_quantity: 0, lag_quantity: 0 },
            thirdweek: { achieved_quantity: 0, planned_quantity: 0, lag_quantity: 0 },
            fourthweek: { achieved_quantity: 0, planned_quantity: 0, lag_quantity: 0 },
        };

        const month = startDate.getMonth();
        const year = startDate.getFullYear();

        const lastDayOfMonth = new Date(year, month + 1, 0).getDate();

        weekBoundaries.fourthweek.end = lastDayOfMonth;

        for (const [weekName, boundary] of Object.entries(weekBoundaries)) {
            const weeklyDaily = daily.filter((d) => {
                const dayOfMonth = d.date.getDate();
                return dayOfMonth >= boundary.start && dayOfMonth <= boundary.end;
            });

            if (weeklyDaily.length === 0) {
                continue;
            }

            const achievedQuantity = weeklyDaily.reduce((sum, d) => sum + (d.quantity || 0), 0);

            const workingDays = weeklyDaily.length;

            const plannedQuantity = workingDays * workingQuantityPerDay;

            const lagQuantity = plannedQuantity - achievedQuantity;

            weekly[weekName] = {
                achieved_quantity: Number(achievedQuantity.toFixed(2)),
                planned_quantity: Number(plannedQuantity.toFixed(2)),
                lag_quantity: Number(lagQuantity.toFixed(2)),
            };
        }

        return weekly;
    }

    static async getSchedule(tender_id) {
        const schedule = await ScheduleModel.findOne({ tender_id });
        const items = schedule.items.map((item) => {
            return {
                wbs_id: item.wbs_id,
                description: item.description,
                unit: item.unit,
                quantity: item.quantity,
                executed_quantity: item.executed_quantity,
                balance_quantity: item.balance_quantity,
                duration: item.duration,
                revised_duration: item.revised_duration,
                lag: item.lag,
                start_date: item.start_date,
                end_date: item.end_date,
                revised_end_date: item.revised_end_date,
                status: item.status,
            };
        });
        return items;
    }

    static async getDailySchedule(tender_id) {
        const schedule = await ScheduleModel.findOne({ tender_id });
        const items = schedule.items.map((item) => {
            return {
                wbs_id: item.wbs_id,
                description: item.description,
                unit: item.unit,
                quantity: item.quantity,
                start_date: item.start_date,
                end_date: item.end_date,
                revised_end_date: item.revised_end_date,
                daily: item.daily,
                weekly: item.weekly,
            };
        });
        return items;
    }


    static async getWeeklySchedule(tender_id) {
        const schedule = await ScheduleModel.findOne({ tender_id });
        const items = schedule.items.map((item) => {
            return {
                wbs_id: item.wbs_id,
                description: item.description,
                unit: item.unit,
                start_date: item.start_date,
                end_date: item.end_date,
                revised_end_date: item.revised_end_date,
                duration: item.duration,
                revised_duration: item.revised_duration,
                lag: item.lag,
                executed_quantity: item.executed_quantity,
                balance_quantity: item.balance_quantity,
                status: item.status,
                quantity: item.quantity,
                weekly: item.weekly,
            };
        });
        return items;
    }

    static async getMonthlySchedule(tender_id) {
        const schedule = await ScheduleModel.findOne({ tender_id });
        const items = schedule.items.map((item) => {
            return {
                wbs_id: item.wbs_id,
                description: item.description,
                unit: item.unit,
                quantity: item.quantity,
                monthly: item.monthly,
            };
        });
        return items;
    }



    // Helper: Get difference in days
    static getDaysDiff(start, end) {
        const a = moment(start).startOf('day');
        const b = moment(end).startOf('day');
        return b.diff(a, 'days') + 1; // Inclusive
    }

    // Helper: Generate daily array structure
    static generateDailyArray(startDate, endDate, existingDaily = []) {
        const start = moment(startDate).startOf('day');
        const end = moment(endDate).startOf('day');
        const days = end.diff(start, 'days') + 1;

        const newDaily = [];
        const existingMap = new Map();

        // Map existing data for quick lookup
        existingDaily.forEach(d => {
            const dateKey = moment(d.date).format('YYYY-MM-DD');
            existingMap.set(dateKey, d.quantity);
        });

        for (let i = 0; i < days; i++) {
            const current = moment(start).add(i, 'days');
            const dateKey = current.format('YYYY-MM-DD');

            newDaily.push({
                date: current.toDate(),
                quantity: existingMap.has(dateKey) ? existingMap.get(dateKey) : 0
            });
        }
        return newDaily;
    }

    // Helper: Recalculate Weekly Metrics
    static calculateWeeklyMetrics1(item) {
        const dailyRate = item.quantity / item.revised_duration;
        const weeklyData = {
            firstweek: { achieved_quantity: 0, planned_quantity: 0, lag_quantity: 0 },
            secondweek: { achieved_quantity: 0, planned_quantity: 0, lag_quantity: 0 },
            thirdweek: { achieved_quantity: 0, planned_quantity: 0, lag_quantity: 0 },
            fourthweek: { achieved_quantity: 0, planned_quantity: 0, lag_quantity: 0 },
        };

        const monthStart = moment(item.start_date).startOf('month'); // Context is start date's month

        item.daily.forEach(day => {
            const dayMoment = moment(day.date);
            const dayNum = dayMoment.date(); // 1-31
            let weekKey = "";

            if (dayNum <= 7) weekKey = "firstweek";
            else if (dayNum <= 14) weekKey = "secondweek";
            else if (dayNum <= 21) weekKey = "thirdweek";
            else weekKey = "fourthweek";

            // Add Achieved
            weeklyData[weekKey].achieved_quantity += (day.quantity || 0);

            // Add Planned
            weeklyData[weekKey].planned_quantity += dailyRate;
        });

        // Finalize Lag and Rounding
        Object.keys(weeklyData).forEach(key => {
            const w = weeklyData[key];
            w.planned_quantity = parseFloat(w.planned_quantity.toFixed(2));
            w.achieved_quantity = parseFloat(w.achieved_quantity.toFixed(2));

            // Lag logic: Planned - Achieved
            // If planned is 0 (week not active), lag is 0.
            if (w.planned_quantity > 0) {
                w.lag_quantity = parseFloat((w.planned_quantity - w.achieved_quantity).toFixed(2));
            } else {
                w.lag_quantity = 0;
            }
        });

        return weeklyData;
    }

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
                    // Determine effective dates (New or Existing)
                    const effectiveStart = newStartStr ? new Date(newStartStr) : item.start_date;
                    const effectiveRevisedEnd = newRevisedEndStr ? new Date(newRevisedEndStr) : item.revised_end_date;
                    const originalEnd = item.end_date; // Keep original end date reference

                    // A. Update Start Date & Original Duration
                    if (newStartStr) {
                        item.start_date = effectiveStart;
                        // Recalculate Original Duration (Start -> Original End)
                        const newOrgDuration = this.getDaysDiff(effectiveStart, originalEnd);
                        item.duration = newOrgDuration > 0 ? newOrgDuration : 0;
                    }

                    // B. Update Revised End Date
                    if (newRevisedEndStr) {
                        item.revised_end_date = effectiveRevisedEnd;
                    }

                    // C. Always Recalculate Revised Duration (Start -> Revised End)
                    // (This needs to update if EITHER start OR revised end changes)
                    const newRevDuration = this.getDaysDiff(effectiveStart, effectiveRevisedEnd);
                    item.revised_duration = newRevDuration > 0 ? newRevDuration : 0;

                    // D. Regenerate Daily Array
                    item.daily = this.generateDailyArray(effectiveStart, effectiveRevisedEnd, item.daily);
                    isModified = true;
                }

                // --- 2. Handle Daily Quantity Updates ---
                if (daily_updates) {
                    item.daily.forEach(dayRecord => {
                        const key = `${item.wbs_id}-${dayRecord.date.toISOString()}`;
                        if (daily_updates.hasOwnProperty(key)) {
                            const newQty = parseFloat(daily_updates[key]);
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

                    if (item.executed_quantity >= item.quantity) item.status = "completed";
                    else if (item.executed_quantity > 0) item.status = "inprogress";
                    else item.status = "pending";

                    // *** UPDATE LAG HERE ***
                    // Lag = Revised Duration - Original Duration
                    if (item.revised_duration !== undefined && item.duration !== undefined) {
                        item.lag = item.revised_duration - item.duration;
                    }

                    item.weekly = this.calculateWeeklyMetrics1(item);

                    item.monthly.executed_quantity = item.executed_quantity;
                    item.monthly.planned_quantity = item.quantity;
                }
            }

            await schedule.save();
            return schedule;

        } catch (error) {
            throw error;
        }
    }

}

export default ScheduleService;
