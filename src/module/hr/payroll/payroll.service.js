import ExcelJS from "exceljs";
import { PayrollModel } from "./payroll.model.js";
import EmployeeModel from "../employee/employee.model.js";
import UserAttendanceModel from "../userAttendance/userAttendance.model.js";

class PayrollService {

  // --- 1. GENERATE PAYROLL for an employee for a given month ---
  static async generatePayroll(employeeId, month, year) {
    // A. Prevent duplicate
    const existing = await PayrollModel.findOne({ employeeId, month, year });
    if (existing) {
      throw { statusCode: 409, message: `Payroll already generated for ${month}/${year}` };
    }

    // B. Fetch employee basic salary
    const employee = await EmployeeModel.findById(employeeId);
    if (!employee) throw { statusCode: 404, message: "Employee not found" };

    const basicSalary = employee.payroll?.basicSalary || 0;
    if (!basicSalary) throw { statusCode: 400, message: "Employee basic salary not set. Please update payroll details first." };

    // C. Fetch attendance summary for the month
    const startDate = new Date(Date.UTC(year, month - 1, 1));
    const endDate   = new Date(Date.UTC(year, month, 0, 23, 59, 59));

    const records = await UserAttendanceModel.find({
      employeeId,
      date: { $gte: startDate, $lte: endDate },
    }).lean();

    let presentDays  = 0;
    let halfDays     = 0;
    let lwpDays      = 0;
    let paidLeaveDays = 0;
    let overtimeHrs  = 0;

    for (const r of records) {
      if (r.status === "Present") presentDays++;
      else if (r.status === "Half-Day") halfDays += 0.5;
      else if (r.status === "Absent" && !r.payroll?.penalty?.isApplied) lwpDays++;
      if (r.status === "On Leave") paidLeaveDays++;
      overtimeHrs += r.overtimeHours || 0;
    }

    // Working days in month = total attendance records (cron marks absent daily)
    const totalWorkingDays = records.length;

    // D. Earnings
    const perDayBasic = basicSalary / 30;
    const hra         = Math.round(basicSalary * 0.40); // 40% of basic
    const da          = Math.round(basicSalary * 0.10); // 10% of basic
    const overtimePay = Math.round((perDayBasic / 8) * 1.5 * overtimeHrs); // 1.5x hourly
    const grossPay    = basicSalary + hra + da + overtimePay;

    // E. Deductions
    const pf             = Math.round(basicSalary * 0.12);           // 12% of basic
    const esi            = basicSalary <= 21000 ? Math.round(grossPay * 0.0075) : 0; // ESI if ≤ 21000
    const lwpDeduction   = Math.round(perDayBasic * lwpDays);
    const halfDayDeduc   = Math.round(perDayBasic * halfDays);
    const totalDeductions = pf + esi + lwpDeduction + halfDayDeduc;

    const netPay = Math.max(0, grossPay - totalDeductions);

    // F. Save
    const payroll = new PayrollModel({
      employeeId,
      month,
      year,
      attendanceSummary: {
        totalWorkingDays,
        presentDays: presentDays + halfDays,
        paidLeaves: paidLeaveDays,
        lwp: lwpDays,
        overtimeHours: overtimeHrs,
      },
      earnings: {
        basic: basicSalary,
        hra,
        da,
        overtimePay,
        otherAllowances: 0,
        grossPay,
      },
      deductions: {
        pf,
        esi,
        tax: 0, // TDS — calculated separately by HR
        lwpDeduction: lwpDeduction + halfDayDeduc,
        totalDeductions,
      },
      netPay,
      status: "Pending",
    });

    return await payroll.save();
  }

  // --- 2. BULK GENERATE for all active employees in a month ---
  static async bulkGeneratePayroll(month, year) {
    const employees = await EmployeeModel.find({
      isDeleted: { $ne: true },
      status: "Active",
      "payroll.basicSalary": { $gt: 0 },
    }).select("_id");

    const results = { generated: [], skipped: [], errors: [] };

    for (const emp of employees) {
      try {
        const doc = await PayrollService.generatePayroll(emp._id, month, year);
        results.generated.push(doc._id);
      } catch (err) {
        if (err.statusCode === 409) {
          results.skipped.push(emp._id); // Already generated
        } else {
          results.errors.push({ employeeId: emp._id, message: err.message });
        }
      }
    }

    return results;
  }

  // --- 3. GET PAYROLL (employee view — all months for a year) ---
  static async getEmployeePayroll(employeeId, year) {
    const query = { employeeId };
    if (year) query.year = parseInt(year);
    return await PayrollModel.find(query).sort({ year: -1, month: -1 });
  }

  // --- 4. GET MONTHLY RUN (HR admin view — all employees for a month) ---
  static async getMonthlyPayrollRun(month, year) {
    return await PayrollModel.find({ month: parseInt(month), year: parseInt(year) })
      .populate("employeeId", "name employeeId designation department payroll")
      .sort({ netPay: -1 });
  }

  // --- 5. UPDATE STATUS (Pending → Processed → Paid) ---
  static async updatePayrollStatus(payrollId, status, transactionId, paymentDate) {
    const allowed = ["Pending", "Processed", "Paid"];
    if (!allowed.includes(status)) {
      throw { statusCode: 400, message: `Invalid status. Must be one of: ${allowed.join(", ")}` };
    }

    const update = { status };
    if (transactionId) update.transactionId = transactionId;
    if (paymentDate)   update.paymentDate   = new Date(paymentDate);

    const payroll = await PayrollModel.findByIdAndUpdate(payrollId, { $set: update }, { new: true });
    if (!payroll) throw { statusCode: 404, message: "Payroll record not found" };
    return payroll;
  }

  // --- 6. UPDATE TAX (HR sets TDS manually) ---
  static async updateTax(payrollId, taxAmount) {
    const payroll = await PayrollModel.findById(payrollId);
    if (!payroll) throw { statusCode: 404, message: "Payroll record not found" };
    if (payroll.status === "Paid") throw { statusCode: 400, message: "Cannot modify a paid payroll" };

    payroll.deductions.tax = taxAmount;
    payroll.deductions.totalDeductions = payroll.deductions.pf + payroll.deductions.esi
      + taxAmount + payroll.deductions.lwpDeduction;
    payroll.netPay = Math.max(0, payroll.earnings.grossPay - payroll.deductions.totalDeductions);
    return await payroll.save();
  }

  // --- 7. BANK EXPORT — Returns an ExcelJS Workbook buffer ---
  // Produces two sheets: (1) Bank Transfer Sheet  (2) Full Payroll Detail
  static async exportBankExcel(month, year) {
    const records = await PayrollModel.find({ month: parseInt(month), year: parseInt(year) })
      .populate("employeeId", "name employeeId designation department payroll")
      .sort({ netPay: -1 })
      .lean();

    if (!records.length) throw { statusCode: 404, message: `No payroll records found for ${month}/${year}` };

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Romaa HR";
    workbook.created = new Date();

    // ── Sheet 1: Bank Transfer (NEFT format) ──────────────────────────────
    const bankSheet = workbook.addWorksheet("Bank Transfer");
    bankSheet.columns = [
      { header: "Sr No",          key: "sr",        width: 6  },
      { header: "Employee ID",    key: "empId",     width: 12 },
      { header: "Employee Name",  key: "name",      width: 28 },
      { header: "Bank Name",      key: "bank",      width: 20 },
      { header: "Account Number", key: "account",   width: 20 },
      { header: "IFSC Code",      key: "ifsc",      width: 14 },
      { header: "Net Pay (₹)",    key: "netPay",    width: 14 },
      { header: "Status",         key: "status",    width: 12 },
    ];

    // Style header row
    bankSheet.getRow(1).font = { bold: true };
    bankSheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } };
    bankSheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };

    records.forEach((r, i) => {
      bankSheet.addRow({
        sr:      i + 1,
        empId:   r.employeeId?.employeeId || "—",
        name:    r.employeeId?.name       || "—",
        bank:    r.employeeId?.payroll?.bankName      || "—",
        account: r.employeeId?.payroll?.accountNumber || "—",
        ifsc:    r.employeeId?.payroll?.ifscCode      || "—",
        netPay:  r.netPay,
        status:  r.status,
      });
    });

    // Total row
    const totalRow = bankSheet.addRow({
      sr: "", empId: "", name: "TOTAL", bank: "", account: "", ifsc: "",
      netPay: records.reduce((s, r) => s + r.netPay, 0),
      status: "",
    });
    totalRow.font = { bold: true };

    // ── Sheet 2: Full Payroll Detail ──────────────────────────────────────
    const detailSheet = workbook.addWorksheet("Payroll Detail");
    detailSheet.columns = [
      { header: "Employee ID",   key: "empId",        width: 12 },
      { header: "Name",          key: "name",         width: 24 },
      { header: "Department",    key: "dept",         width: 16 },
      { header: "Working Days",  key: "workDays",     width: 14 },
      { header: "Present Days",  key: "presentDays",  width: 14 },
      { header: "LWP Days",      key: "lwp",          width: 10 },
      { header: "Basic (₹)",     key: "basic",        width: 12 },
      { header: "HRA (₹)",       key: "hra",          width: 12 },
      { header: "DA (₹)",        key: "da",           width: 12 },
      { header: "OT Pay (₹)",    key: "otPay",        width: 12 },
      { header: "Gross Pay (₹)", key: "gross",        width: 14 },
      { header: "PF (₹)",        key: "pf",           width: 12 },
      { header: "ESI (₹)",       key: "esi",          width: 12 },
      { header: "TDS (₹)",       key: "tds",          width: 12 },
      { header: "LWP Dedn (₹)",  key: "lwpDedn",      width: 14 },
      { header: "Total Dedn (₹)",key: "totalDedn",    width: 14 },
      { header: "Net Pay (₹)",   key: "netPay",       width: 14 },
      { header: "Status",        key: "status",       width: 12 },
    ];

    detailSheet.getRow(1).font = { bold: true };
    detailSheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } };
    detailSheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };

    records.forEach((r) => {
      detailSheet.addRow({
        empId:       r.employeeId?.employeeId                          || "—",
        name:        r.employeeId?.name                                || "—",
        dept:        r.employeeId?.department                          || "—",
        workDays:    r.attendanceSummary?.totalWorkingDays             || 0,
        presentDays: r.attendanceSummary?.presentDays                  || 0,
        lwp:         r.attendanceSummary?.lwp                          || 0,
        basic:       r.earnings?.basic                                 || 0,
        hra:         r.earnings?.hra                                   || 0,
        da:          r.earnings?.da                                    || 0,
        otPay:       r.earnings?.overtimePay                           || 0,
        gross:       r.earnings?.grossPay                              || 0,
        pf:          r.deductions?.pf                                  || 0,
        esi:         r.deductions?.esi                                 || 0,
        tds:         r.deductions?.tax                                 || 0,
        lwpDedn:     r.deductions?.lwpDeduction                        || 0,
        totalDedn:   r.deductions?.totalDeductions                     || 0,
        netPay:      r.netPay                                          || 0,
        status:      r.status,
      });
    });

    // Alternate row shading
    detailSheet.eachRow((row, rowNum) => {
      if (rowNum > 1 && rowNum % 2 === 0) {
        row.eachCell((cell) => {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0F4F8" } };
        });
      }
    });

    return await workbook.xlsx.writeBuffer();
  }
}

export default PayrollService;
