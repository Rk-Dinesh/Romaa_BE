import LeaveBalanceHistoryModel from "./leaveBalanceHistory.model.js";

class LeaveBalanceHistoryService {

  // --- Core logger — called from leave service and cron ---
  static async log({ employeeId, leaveType, changeType, amount, balanceBefore, balanceAfter, reason, leaveRequestId = null, performedBy = null }) {
    return await LeaveBalanceHistoryModel.create({
      employeeId,
      leaveType,
      changeType,
      amount,
      balanceBefore,
      balanceAfter,
      reason,
      leaveRequestId,
      performedBy,
    });
  }

  // --- Convenience: log a Debit (approval) ---
  static async logDebit({ employeeId, leaveType, amount, balanceBefore, leaveRequestId, performedBy, reason }) {
    return LeaveBalanceHistoryService.log({
      employeeId, leaveType,
      changeType: "Debit",
      amount,
      balanceBefore,
      balanceAfter: balanceBefore - amount,
      reason: reason || `Leave Approved`,
      leaveRequestId,
      performedBy,
    });
  }

  // --- Convenience: log a Credit (cancellation / refund) ---
  static async logCredit({ employeeId, leaveType, amount, balanceBefore, leaveRequestId, performedBy, reason }) {
    return LeaveBalanceHistoryService.log({
      employeeId, leaveType,
      changeType: "Credit",
      amount,
      balanceBefore,
      balanceAfter: balanceBefore + amount,
      reason: reason || `Leave Cancelled — balance refunded`,
      leaveRequestId,
      performedBy,
    });
  }

  // --- Get history for an employee (paginated, optional leaveType filter) ---
  static async getHistory(employeeId, { leaveType, changeType, page = 1, limit = 30 } = {}) {
    const query = { employeeId };
    if (leaveType)  query.leaveType  = leaveType;
    if (changeType) query.changeType = changeType;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [records, total] = await Promise.all([
      LeaveBalanceHistoryModel.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .populate("leaveRequestId", "leaveType fromDate toDate totalDays")
        .populate("performedBy", "name employeeId"),
      LeaveBalanceHistoryModel.countDocuments(query),
    ]);

    return {
      records,
      pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / limit) },
    };
  }

  // --- Summary: current year transaction totals per leave type ---
  static async getYearlySummary(employeeId, year) {
    const start = new Date(Date.UTC(year, 0, 1));
    const end   = new Date(Date.UTC(year, 11, 31, 23, 59, 59));

    return await LeaveBalanceHistoryModel.aggregate([
      { $match: { employeeId: employeeId, createdAt: { $gte: start, $lte: end } } },
      {
        $group: {
          _id: { leaveType: "$leaveType", changeType: "$changeType" },
          totalAmount: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.leaveType": 1 } },
    ]);
  }
}

export default LeaveBalanceHistoryService;
