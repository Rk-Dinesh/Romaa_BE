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
          workDetails: [],
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
          notes: row.Notes || "",
        });
      }
    }

    // Construct the majorHeadings array for saving
    const majorHeadings = Object.keys(hierarchy).map((mh) => ({
      majorHeadingName: mh,
      subheadings: Object.keys(hierarchy[mh]).map((cw) => ({
        customworks: cw,
        subworks: Object.values(hierarchy[mh][cw]),
      })),
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
      majorHeadings,
    };

    const saved = await ScheduleModel.create(scheduleDoc);
    return saved;
  }

   static async updateReportDateAndDaysRemaining(tenderId, reportDateStr) {
    const schedule = await ScheduleModel.findOne({ tenderId });
    if (!schedule) return null;

    schedule.reportDate = new Date(reportDateStr);

    for (const major of schedule.majorHeadings) {
      for (const sub of major.subheadings) {
        for (const subwork of sub.subworks) {
          for (const wd of subwork.workDetails) {
            if (wd.endDate) {
              const endDt = new Date(wd.endDate);
              const reportDt = new Date(reportDateStr);
              // daysRemaining: days between reportDate and endDate, min 0
              const diff = Math.ceil((endDt - reportDt) / (1000 * 60 * 60 * 24));
              wd.daysRemaining = diff > 0 ? diff : 0;
            }
          }
        }
      }
    }

    await schedule.save();
    return schedule.toObject();
  }

   static async findSchedulesFiltered(tenderId, dateFilter, particularDate) {
    const schedules = await ScheduleModel.find({ tenderId }).lean();

    const filterSchedule = (schedule) => {
      schedule.majorHeadings = schedule.majorHeadings
        .map((major) => {
          major.subheadings = major.subheadings
            .map((sub) => {
              sub.subworks = sub.subworks
                .map((subwork) => {
                  subwork.workDetails = subwork.workDetails.filter((wd) => {
                    if (!wd.startDate || !wd.endDate) return false;

                    const wdStart = new Date(wd.startDate);
                    const wdEnd = new Date(wd.endDate);

                    if (particularDate) {
                      const pd = new Date(particularDate);
                      return pd >= wdStart && pd <= wdEnd;
                    } else if (dateFilter && dateFilter.$gte && dateFilter.$lte) {
                      // Correct overlap check
                      return wdStart <= dateFilter.$lte && wdEnd >= dateFilter.$gte;
                    } else if (dateFilter instanceof Date) {
                      return dateFilter >= wdStart && dateFilter <= wdEnd;
                    }
                    return true;
                  });
                  return subwork.workDetails.length > 0 ? subwork : null;
                })
                .filter(sw => sw);
              return sub.subworks.length > 0 ? sub : null;
            })
            .filter(s => s);
          return major.subheadings.length > 0 ? major : null;
        })
        .filter(m => m);
      return schedule;
    };

    return schedules.map(filterSchedule).filter(sc => sc.majorHeadings.length > 0);
  }
}

export default ScheduleService;

