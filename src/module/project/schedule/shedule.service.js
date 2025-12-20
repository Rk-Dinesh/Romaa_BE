import mongoose from "mongoose";
import IdcodeServices from "../../idcode/idcode.service.js";
import ScheduleModel from "./schedule.model.js";

class ScheduleService {
    /**
     * Create schedule from CSV with basic info (description, unit, quantity)
     */
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

    /**
     * Update schedule with dates, duration, and auto-calculate derived fields
     */
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

    
}

export default ScheduleService;
