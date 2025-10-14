import ScheduleModel from "./schedule.model.js";

class ScheduleService {
    static async bulkInsertSchedule(csvRows, body) {
        // Group rows by majorHeading, customworks, subworkName
        const hierarchy = {};
        for (const row of csvRows) {
            const mh = row.MajorHeading?.trim() || "General";
            const cw = row.CustomWorks?.trim() || "Main";
            const sw = row.SubWorkName?.trim() || "Section";

            if (!hierarchy[mh]) hierarchy[mh] = {};
            if (!hierarchy[mh][cw]) hierarchy[mh][cw] = {};
            if (!hierarchy[mh][cw][sw]) {
                hierarchy[mh][cw][sw] = {
                    subworkName: sw,
                    Unit: row.SubWorkUnit,
                    total_Qty: Number(row.SubWorkQty),
                    startDate: row.SubWorkStartDate,
                    endDate: row.SubWorkEndDate,
                    workDetails: []
                };
            }

            if (row.Description && row.Unit) {
                hierarchy[mh][cw][sw].workDetails.push({
                    description: row.Description,
                    unit: row.Unit,
                    qty: Number(row.Qty),
                    executedQty: Number(row.ExecutedQty) || 0,
                    balanceQty: Number(row.BalanceQty) || 0,
                    startDate: row.StartDate,
                    endDate: row.EndDate,
                    duration: Number(row.Duration) || null,
                    delay: Number(row.Delay) || 0,
                    status: row.Status?.trim() || "pending",
                    daysRemaining: Number(row.DaysRemaining) || null,
                    notes: row.Notes || ""
                });
            }
        }

        // Construct the majorHeadings array for saving
        const majorHeadings = Object.keys(hierarchy).map(mh => ({
            majorHeadingName: mh,
            subheadings: Object.keys(hierarchy[mh]).map(cw => ({
                customworks: cw,
                subworks: Object.values(hierarchy[mh][cw])
            }))
        }));

        // Compose the Schedule document fields
        const scheduleDoc = {
            workOrderDate: body.workOrderDate,
            aggDate: body.aggDate,
            agreementValue: Number(body.agreementValue),
            projectEndDate: body.projectEndDate,
            plannedCompletionDate: body.plannedCompletionDate,
            reportDate: body.reportDate,
            projectName: body.projectName,
            tenderId: body.tenderId,
            notes: body.notes || "",
            majorHeadings
        };

        const saved = await ScheduleModel.create(scheduleDoc);
        return saved;
    }
}

export default ScheduleService;
