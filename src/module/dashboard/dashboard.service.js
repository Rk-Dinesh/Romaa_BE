import TenderModel from "../tender/tender/tender.model.js";
import PurchaseRequestModel from "../purchase/purchaseorderReqIssue/purchaseReqIssue.model.js";
import WorkOrderRequestModel from "../project/workorderReqIssue/workorderReqIssue.model.js";
import LeaveRequestModel from "../hr/leave/leaverequest.model.js";
import UserAttendanceModel from "../hr/userAttendance/userAttendance.model.js";
import EmployeeModel from "../hr/employee/employee.model.js";
import BillingModel from "../finance/clientbilling/clientbilling/clientbilling.model.js";
import MachineryAssetModel from "../assets/machinery/machineryasset.model.js";
import VendorModel from "../purchase/vendor/vendor.model.js";

import ClientModel from "../clients/client.model.js";
import NotificationModel from "../notifications/notification.model.js";

class DashboardService {
  /**
   * Main dashboard aggregator — runs only the sections the user has permission for.
   * All queries execute in parallel for maximum speed.
   */
  static async getDashboard(user) {
    const permissions = user.role?.permissions;
    if (!permissions) return { message: "No role assigned" };

    const tasks = {};
    const assignedProjects = user.assignedProject || [];
    const isSiteUser = user.userType === "Site" && assignedProjects.length > 0;

    // Build project filter for site-scoped users
    const projectScope = isSiteUser
      ? assignedProjects.map((p) => (typeof p === "object" ? p.tender_id || p._id : p))
      : null;

    // --- Collect all permitted data fetchers ---

    // 1. Overview (always if dashboard.read)
    if (permissions.dashboard?.read) {
      tasks.overview = this.getOverview();
    }

    // 2. Tender pipeline
    if (permissions.tender?.tenders?.read) {
      tasks.tenderPipeline = this.getTenderPipeline(projectScope);
    }

    // 3. EMD summary
    if (permissions.tender?.emd?.read) {
      tasks.emdSummary = this.getEmdSummary(projectScope);
    }

    // 4. Penalty summary (now includes project-based breakdown)
    if (permissions.tender?.project_penalty?.read) {
      tasks.penaltySummary = this.getPenaltySummary(projectScope);
    }

    // 5. Purchase requests (with recent raised & quotation received details)
    if (permissions.purchase?.request?.read) {
      tasks.purchaseRequests = this.getPurchaseRequestPipeline(projectScope);
    }

    // 6. Work orders (with recent raised & quotation received details)
    if (permissions.project?.wo_issuance?.read) {
      tasks.workOrders = this.getWorkOrderPipeline(projectScope);
    }

    // 7. Client billing (with project-based breakdown)
    if (permissions.project?.client_billing?.read || permissions.finance?.client_billing?.read) {
      tasks.billing = this.getBillingSummary(projectScope);
    }

    // 8. HR - Employees
    if (permissions.hr?.employee?.read) {
      tasks.employees = this.getEmployeeSummary();
    }

    // 9. HR - Today's Attendance
    if (permissions.hr?.attendance?.read) {
      tasks.todayAttendance = this.getTodayAttendance();
    }

    // 10. HR - Pending Leaves
    if (permissions.hr?.leave?.read) {
      tasks.pendingLeaves = this.getPendingLeaves(user);
    }

    // 11. Machinery assets
    if (permissions.project?.assets?.read || permissions.site?.site_assets?.read) {
      tasks.machinery = this.getMachinerySummary();
    }

    // 12. My Work Profile (always for logged-in user — own attendance, leaves, applications)
    tasks.myWorkProfile = this.getMyWorkProfile(user);

    // 13. Upcoming deadlines (tender submission deadlines within 15 days)
    if (permissions.tender?.tenders?.read) {
      tasks.upcomingDeadlines = this.getUpcomingDeadlines(projectScope);
    }

    // 14. Notifications (always for logged-in user)
    tasks.notifications = this.getRecentNotifications(user);

    // --- Execute all in parallel ---
    const keys = Object.keys(tasks);
    const results = await Promise.all(Object.values(tasks));

    const dashboard = {};
    keys.forEach((key, i) => {
      dashboard[key] = results[i];
    });

    return dashboard;
  }

  // ============================================================
  // SECTION FETCHERS — Each returns a lightweight summary object
  // ============================================================

  // 1. Overview — basic entity counts
  static async getOverview() {
    const [tenders, projects, employees, vendors, clients] = await Promise.all([
      TenderModel.countDocuments(),
      TenderModel.countDocuments({ workOrder_id: { $nin: [null, ""] } }),
      EmployeeModel.countDocuments({ isDeleted: { $ne: true }, status: "Active" }),
      VendorModel.countDocuments(),
      ClientModel.countDocuments(),
    ]);

    return { tenders, projects, activeEmployees: employees, vendors, clients };
  }

  // 2. Tender pipeline — counts by status check stages
  static async getTenderPipeline(projectScope) {
    const match = projectScope ? { tender_id: { $in: projectScope } } : {};

    const [statusCounts, valueSummary] = await Promise.all([
      TenderModel.aggregate([
        { $match: match },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            pending: { $sum: { $cond: [{ $eq: ["$tender_status", "PENDING"] }, 1, 0] } },
            approved: { $sum: { $cond: [{ $eq: ["$tender_status", "APPROVED"] }, 1, 0] } },
            withWorkOrder: { $sum: { $cond: [{ $ne: ["$workOrder_id", null] }, 1, 0] } },
            totalValue: { $sum: { $ifNull: ["$tender_value", 0] } },
            totalAgreementValue: { $sum: { $ifNull: ["$agreement_value", 0] } },
          },
        },
      ]),
      TenderModel.find(match)
        .sort({ createdAt: -1 })
        .limit(5)
        .select("tender_id tender_name tender_status tender_value client_name createdAt")
        .lean(),
    ]);

    return {
      counts: statusCounts[0] || { total: 0, pending: 0, approved: 0, withWorkOrder: 0, totalValue: 0, totalAgreementValue: 0 },
      recentTenders: valueSummary,
    };
  }

  // 3. EMD summary
  static async getEmdSummary(projectScope) {
    const match = projectScope ? { tender_id: { $in: projectScope } } : {};

    const result = await TenderModel.aggregate([
      { $match: { ...match, "emd.approved_emd_details.0": { $exists: true } } },
      { $unwind: "$emd.approved_emd_details" },
      {
        $group: {
          _id: null,
          totalApprovedAmount: { $sum: "$emd.approved_emd_details.emd_approved_amount" },
          totalCollected: { $sum: "$emd.approved_emd_details.emd_deposit_amount_collected" },
          totalPending: { $sum: "$emd.approved_emd_details.emd_deposit_pendingAmount" },
          sdTotalAmount: { $sum: "$emd.approved_emd_details.security_deposit_amount" },
          sdCollected: { $sum: "$emd.approved_emd_details.security_deposit_amount_collected" },
          sdPending: { $sum: "$emd.approved_emd_details.security_deposit_pendingAmount" },
          count: { $sum: 1 },
        },
      },
    ]);

    return result[0] || {
      totalApprovedAmount: 0, totalCollected: 0, totalPending: 0,
      sdTotalAmount: 0, sdCollected: 0, sdPending: 0, count: 0,
    };
  }

  // 4. Penalty summary — total + project-based breakdown
  static async getPenaltySummary(projectScope) {
    const match = projectScope
      ? { tender_id: { $in: projectScope } }
      : {};

    const [totals, byProject] = await Promise.all([
      TenderModel.aggregate([
        { $match: { ...match, penalty_final_value: { $gt: 0 } } },
        {
          $group: {
            _id: null,
            totalPenaltyValue: { $sum: "$penalty_final_value" },
            tendersWithPenalties: { $sum: 1 },
          },
        },
      ]),
      TenderModel.aggregate([
        { $match: { ...match, penalty_final_value: { $gt: 0 } } },
        {
          $group: {
            _id: "$tender_id",
            projectName: { $first: "$tender_project_name" },
            tenderName: { $first: "$tender_name" },
            penaltyValue: { $sum: "$penalty_final_value" },
          },
        },
        { $sort: { penaltyValue: -1 } },
        { $limit: 10 },
      ]),
    ]);

    return {
      ...(totals[0] || { totalPenaltyValue: 0, tendersWithPenalties: 0 }),
      byProject,
    };
  }

  // 5. Purchase request pipeline — counts + recent raised & quotation received details
  static async getPurchaseRequestPipeline(projectScope) {
    const match = projectScope ? { projectId: { $in: projectScope } } : {};

    const selectFields = "requestId title projectId tender_project_name requestDate requiredByDate status";

    const [statusAgg, recentRaised, recentQuotationReceived] = await Promise.all([
      PurchaseRequestModel.aggregate([
        { $match: match },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
      PurchaseRequestModel.find({ ...match, status: "Request Raised" })
        .sort({ requestDate: -1 })
        .limit(5)
        .select(selectFields)
        .lean(),
      PurchaseRequestModel.find({ ...match, status: "Quotation Received" })
        .sort({ updatedAt: -1 })
        .limit(5)
        .select(`${selectFields} vendorQuotations.quotationId vendorQuotations.vendorName vendorQuotations.totalQuotedValue vendorQuotations.approvalStatus`)
        .lean(),
    ]);

    const counts = {
      requestRaised: 0,
      quotationRequested: 0,
      quotationReceived: 0,
      vendorApproved: 0,
      purchaseOrderIssued: 0,
      completed: 0,
    };

    const keyMap = {
      "Request Raised": "requestRaised",
      "Quotation Requested": "quotationRequested",
      "Quotation Received": "quotationReceived",
      "Vendor Approved": "vendorApproved",
      "Purchase Order Issued": "purchaseOrderIssued",
      "Completed": "completed",
    };

    statusAgg.forEach((r) => {
      if (keyMap[r._id]) counts[keyMap[r._id]] = r.count;
    });

    counts.total = Object.values(counts).reduce((a, b) => a + b, 0);

    return { counts, recentRaised, recentQuotationReceived };
  }

  // 6. Work order pipeline — counts + recent raised & quotation received details
  static async getWorkOrderPipeline(projectScope) {
    const match = projectScope ? { projectId: { $in: projectScope } } : {};

    const selectFields = "requestId title projectId tender_project_name requestDate requiredByDate status";

    const [statusAgg, recentRaised, recentQuotationReceived] = await Promise.all([
      WorkOrderRequestModel.aggregate([
        { $match: match },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
      WorkOrderRequestModel.find({ ...match, status: "Request Raised" })
        .sort({ requestDate: -1 })
        .limit(5)
        .select(selectFields)
        .lean(),
      WorkOrderRequestModel.find({ ...match, status: "Quotation Received" })
        .sort({ updatedAt: -1 })
        .limit(5)
        .select(`${selectFields} vendorQuotations.quotationId vendorQuotations.vendorName vendorQuotations.totalQuotedValue vendorQuotations.approvalStatus`)
        .lean(),
    ]);

    const counts = {
      requestRaised: 0,
      quotationReceived: 0,
      vendorApproved: 0,
      workOrderIssued: 0,
      completed: 0,
    };

    const keyMap = {
      "Request Raised": "requestRaised",
      "Quotation Received": "quotationReceived",
      "Vendor Approved": "vendorApproved",
      "Work Order Issued": "workOrderIssued",
      "Completed": "completed",
    };

    statusAgg.forEach((r) => {
      if (keyMap[r._id]) counts[keyMap[r._id]] = r.count;
    });

    counts.total = Object.values(counts).reduce((a, b) => a + b, 0);

    return { counts, recentRaised, recentQuotationReceived };
  }

  // 7. Billing summary — totals + project-based breakdown
  static async getBillingSummary(projectScope) {
    const match = projectScope ? { tender_id: { $in: projectScope } } : {};

    const [statusAgg, projectAgg] = await Promise.all([
      BillingModel.aggregate([
        { $match: match },
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
            totalAmount: { $sum: { $ifNull: ["$grand_total", 0] } },
          },
        },
      ]),
      BillingModel.aggregate([
        { $match: match },
        {
          $group: {
            _id: "$tender_id",
            billCount: { $sum: 1 },
            totalBilled: { $sum: { $ifNull: ["$grand_total", 0] } },
            draft: { $sum: { $cond: [{ $eq: ["$status", "Draft"] }, 1, 0] } },
            submitted: { $sum: { $cond: [{ $eq: ["$status", "Submitted"] }, 1, 0] } },
            approved: { $sum: { $cond: [{ $eq: ["$status", "Approved"] }, 1, 0] } },
            paid: { $sum: { $cond: [{ $eq: ["$status", "Paid"] }, 1, 0] } },
          },
        },
        { $sort: { totalBilled: -1 } },
        { $limit: 10 },
      ]),
    ]);

    const summary = { draft: 0, submitted: 0, approved: 0, paid: 0, totalBilled: 0, billCount: 0 };

    statusAgg.forEach((r) => {
      const key = r._id?.toLowerCase();
      if (summary[key] !== undefined) summary[key] = r.count;
      summary.totalBilled += r.totalAmount;
      summary.billCount += r.count;
    });

    // Enrich project breakdown with tender/project names
    const tenderIds = projectAgg.map((p) => p._id);
    const tenders = tenderIds.length
      ? await TenderModel.find({ tender_id: { $in: tenderIds } })
          .select("tender_id tender_name tender_project_name")
          .lean()
      : [];
    const tenderMap = {};
    tenders.forEach((t) => { tenderMap[t.tender_id] = t; });

    summary.byProject = projectAgg.map((p) => ({
      tenderId: p._id,
      projectName: tenderMap[p._id]?.tender_project_name || "",
      tenderName: tenderMap[p._id]?.tender_name || "",
      billCount: p.billCount,
      totalBilled: p.totalBilled,
      draft: p.draft,
      submitted: p.submitted,
      approved: p.approved,
      paid: p.paid,
    }));

    return summary;
  }

  // 8. Employee summary
  static async getEmployeeSummary() {
    const [byStatus, byDepartment, byUserType] = await Promise.all([
      EmployeeModel.aggregate([
        { $match: { isDeleted: { $ne: true } } },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
      EmployeeModel.aggregate([
        { $match: { isDeleted: { $ne: true }, status: "Active" } },
        { $group: { _id: "$department", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),
      EmployeeModel.aggregate([
        { $match: { isDeleted: { $ne: true }, status: "Active" } },
        { $group: { _id: "$userType", count: { $sum: 1 } } },
      ]),
    ]);

    const statusMap = {};
    byStatus.forEach((r) => { statusMap[r._id || "Unknown"] = r.count; });

    const departmentMap = {};
    byDepartment.forEach((r) => { departmentMap[r._id || "Unassigned"] = r.count; });

    const userTypeMap = {};
    byUserType.forEach((r) => { userTypeMap[r._id || "Unknown"] = r.count; });

    return {
      byStatus: statusMap,
      byDepartment: departmentMap,
      byUserType: userTypeMap,
      total: Object.values(statusMap).reduce((a, b) => a + b, 0),
    };
  }

  // 9. Today's attendance
  static async getTodayAttendance() {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const result = await UserAttendanceModel.aggregate([
      { $match: { date: today } },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]);

    const totalActive = await EmployeeModel.countDocuments({
      isDeleted: { $ne: true },
      status: "Active",
    });

    const counts = { present: 0, absent: 0, halfDay: 0, onLeave: 0, late: 0 };
    result.forEach((r) => {
      const map = {
        "Present": "present",
        "Absent": "absent",
        "Half-Day": "halfDay",
        "On Leave": "onLeave",
      };
      if (map[r._id]) counts[map[r._id]] = r.count;
    });

    // Late count from flags
    const lateCount = await UserAttendanceModel.countDocuments({
      date: today,
      "flags.isLateEntry": true,
    });
    counts.late = lateCount;

    const punchedIn = counts.present + counts.halfDay + counts.absent;
    counts.notYetPunched = totalActive - punchedIn - counts.onLeave;
    counts.totalActive = totalActive;

    return counts;
  }

  // 10. Pending leaves (manager view: their team, HR view: all)
  static async getPendingLeaves(user) {
    const isHR = user.role?.permissions?.hr?.leave?.edit;

    let filter = { status: "Pending" };

    if (!isHR) {
      // Manager — only direct reports
      const team = await EmployeeModel.find({ reportsTo: user._id })
        .select("_id")
        .lean();
      const teamIds = team.map((t) => t._id);
      if (teamIds.length === 0) return { pendingCount: 0, requests: [] };
      filter.employeeId = { $in: teamIds };
    }

    const [count, recent] = await Promise.all([
      LeaveRequestModel.countDocuments(filter),
      LeaveRequestModel.find(filter)
        .sort({ createdAt: -1 })
        .limit(5)
        .populate("employeeId", "name employeeId department designation")
        .select("employeeId leaveType requestType fromDate toDate totalDays status createdAt")
        .lean(),
    ]);

    return { pendingCount: count, requests: recent };
  }

  // 11. Machinery summary + compliance alerts
  static async getMachinerySummary() {
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    const [byStatus, expiringCompliance] = await Promise.all([
      MachineryAssetModel.aggregate([
        { $group: { _id: "$currentStatus", count: { $sum: 1 } } },
      ]),
      MachineryAssetModel.countDocuments({
        currentStatus: { $ne: "Scrapped" },
        $or: [
          { insuranceExpiry: { $lte: thirtyDaysFromNow } },
          { fitnessCertExpiry: { $lte: thirtyDaysFromNow } },
          { pollutionCertExpiry: { $lte: thirtyDaysFromNow } },
          { roadTaxExpiry: { $lte: thirtyDaysFromNow } },
          { permitExpiry: { $lte: thirtyDaysFromNow } },
        ],
      }),
    ]);

    const statusMap = {};
    byStatus.forEach((r) => { statusMap[r._id || "Unknown"] = r.count; });

    return {
      byStatus: statusMap,
      total: Object.values(statusMap).reduce((a, b) => a + b, 0),
      expiringComplianceCount: expiringCompliance,
    };
  }

  // 13. Recent unread notifications for the user
  static async getRecentNotifications(user) {
    const audienceConditions = [
      { audienceType: "common" },
      { audienceType: "user", users: user._id },
    ];
    if (user.role?._id) {
      audienceConditions.push({ audienceType: "role", roles: user.role._id });
    }
    if (user.department) {
      audienceConditions.push({ audienceType: "department", departments: user.department });
    }
    if (user.assignedProject?.length) {
      audienceConditions.push({ audienceType: "project", projects: { $in: user.assignedProject } });
    }

    const [unreadCount, recent] = await Promise.all([
      NotificationModel.countDocuments({
        isActive: true,
        $or: audienceConditions,
        recipients: { $not: { $elemMatch: { userId: user._id, readAt: { $ne: null } } } },
      }),
      NotificationModel.find({
        isActive: true,
        $or: audienceConditions,
        recipients: { $not: { $elemMatch: { userId: user._id, dismissed: true } } },
      })
        .sort({ createdAt: -1 })
        .limit(5)
        .select("title message category priority module actionUrl createdAt")
        .lean(),
    ]);

    return { unreadCount, recent };
  }

  // 14. My Work Profile — logged-in user's own attendance, leave balance, recent leave applications
  static async getMyWorkProfile(user) {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const [todayAttendance, leaveBalance, recentLeaves] = await Promise.all([
      // Today's punch record for this user
      UserAttendanceModel.findOne({ employeeId: user._id, date: today })
        .select("status punchIn punchOut flags totalWorkingHours")
        .lean(),
      // Leave balance from employee record
      EmployeeModel.findById(user._id)
        .select("leaveBalance")
        .lean(),
      // Recent leave applications by this user
      LeaveRequestModel.find({ employeeId: user._id })
        .sort({ createdAt: -1 })
        .limit(5)
        .select("leaveType requestType fromDate toDate totalDays status reason createdAt")
        .lean(),
    ]);

    return {
      todayAttendance: todayAttendance || { status: "Not Punched" },
      leaveBalance: leaveBalance?.leaveBalance || { PL: 0, CL: 0, SL: 0, compOff: 0 },
      recentLeaveApplications: recentLeaves,
    };
  }

  // 15. Upcoming deadlines — tenders with submission deadlines within 15 days
  static async getUpcomingDeadlines(projectScope) {
    const now = new Date();
    const fifteenDaysLater = new Date();
    fifteenDaysLater.setDate(fifteenDaysLater.getDate() + 15);

    const match = {
      tender_end_date: { $gte: now, $lte: fifteenDaysLater },
      tender_status: { $nin: ["APPROVED", "CANCELLED"] },
    };
    if (projectScope) match.tender_id = { $in: projectScope };

    const tenders = await TenderModel.find(match)
      .sort({ tender_end_date: 1 })
      .limit(5)
      .select("tender_id tender_name tender_project_name tender_end_date tender_status tender_value client_name")
      .lean();

    return { count: tenders.length, upcoming: tenders };
  }
}

export default DashboardService;
