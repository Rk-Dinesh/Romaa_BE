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

  static async findSchedulesFiltered(tenderId, dateFilter, particularDate) {
    // Base query by tenderId
    const schedules = await ScheduleModel.find({ tenderId }).lean();

    // Utility function to filter deeply and prune empty hierarchies
    function filterSchedule(schedule) {
      schedule.majorHeadings = schedule.majorHeadings
        .map((major) => {
          major.subheadings = major.subheadings
            .map((sub) => {
              sub.subworks = sub.subworks
                .map((subwork) => {
                  // Filter workDetails based on date criteria
                  subwork.workDetails = subwork.workDetails.filter((wd) => {
                    if (!wd.startDate || !wd.endDate) return false;

                    const wdStart = new Date(wd.startDate);
                    const wdEnd = new Date(wd.endDate);

                    if (particularDate) {
                      const pd = new Date(particularDate);
                      return pd >= wdStart && pd <= wdEnd;
                    } else if (
                      dateFilter &&
                      dateFilter.$gte &&
                      dateFilter.$lte
                    ) {
                      return (
                        wdStart <= dateFilter.$lte && wdEnd >= dateFilter.$gte
                      );
                    }
                    return true;
                  });

                  // Return subwork only if it has workDetails after filtering
                  return subwork.workDetails.length > 0 ? subwork : null;
                })
                .filter((sw) => sw !== null);

              // Return subheading only if it still has subworks
              return sub.subworks.length > 0 ? sub : null;
            })
            .filter((su) => su !== null);

          // Return major heading only if it still has subheadings
          return major.subheadings.length > 0 ? major : null;
        })
        .filter((ma) => ma !== null);

      return schedule;
    }

    // Apply filtering and pruning
    const filteredSchedules = schedules
      .map(filterSchedule)
      .filter((sc) => sc.majorHeadings.length > 0);

    return filteredSchedules;
  }

  static async findSchedulesFiltered1(tenderId, dateFilter, particularDate) {
    // Base query with tenderId
    const schedules = await ScheduleModel.find({ tenderId }).lean();

    // Filter subworks per date criteria:
    // If particularDate given, include subworks whose startDate <= date <= endDate
    // If dateFilter is a range ($gte, $lte), filter subworks intersecting that range

    return schedules.map((schedule) => {
      schedule.majorHeadings = schedule.majorHeadings
        .map((major) => {
          major.subheadings = major.subheadings
            .map((sub) => {
              sub.subworks = sub.subworks.filter((sw) => {
                if (!sw.startDate || !sw.endDate) return true; // no dates, include

                const swStart = new Date(sw.startDate);
                const swEnd = new Date(sw.endDate);

                if (particularDate) {
                  const pd = new Date(particularDate);
                  return pd >= swStart && pd <= swEnd;
                } else if (dateFilter && dateFilter.$gte && dateFilter.$lte) {
                  return swStart <= dateFilter.$lte && swEnd >= dateFilter.$gte;
                }

                return true;
              });
              return sub;
            })
            .filter((sub) => sub.subworks.length > 0);
          return major;
        })
        .filter((major) => major.subheadings.length > 0);
      return schedule;
    });
  }
}

export default ScheduleService;
