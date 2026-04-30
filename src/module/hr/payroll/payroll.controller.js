import PayrollService from "./payroll.service.js";
import path from "path";

export const generatePayroll = async (req, res) => {
  try {
    const { employeeId, month, year } = req.body;
    const data = await PayrollService.generatePayroll(employeeId, parseInt(month), parseInt(year));
    res.status(201).json({ status: true, message: "Payroll generated successfully", data });
  } catch (err) {
    res.status(err.statusCode || 500).json({ status: false, message: err.message });
  }
};

export const bulkGeneratePayroll = async (req, res) => {
  try {
    const { month, year } = req.body;
    if (!month || !year) return res.status(400).json({ status: false, message: "month and year are required" });
    const result = await PayrollService.bulkGeneratePayroll(parseInt(month), parseInt(year));
    res.status(200).json({ status: true, message: "Bulk payroll generation complete", data: result });
  } catch (err) {
    res.status(err.statusCode || 500).json({ status: false, message: err.message });
  }
};

export const getMyPayroll = async (req, res) => {
  try {
    const { year } = req.query;
    const data = await PayrollService.getEmployeePayroll(req.user._id, year);
    res.status(200).json({ status: true, data });
  } catch (err) {
    res.status(500).json({ status: false, message: err.message });
  }
};

export const getEmployeePayroll = async (req, res) => {
  try {
    const { year, page, limit } = req.query;
    const fromdate = req.query.fromdate || null;
    const todate   = req.query.todate   || null;
    const result = await PayrollService.getEmployeePayroll(req.params.employeeId, year, { page, limit, fromdate, todate });
    res.status(200).json({
      status: true,
      currentPage: result.page,
      totalPages: Math.ceil(result.total / result.limit),
      totalCount: result.total,
      data: result.data,
    });
  } catch (err) {
    res.status(500).json({ status: false, message: err.message });
  }
};

export const getMonthlyPayrollRun = async (req, res) => {
  try {
    const { month, year, page, limit, search } = req.query;
    if (!month || !year) return res.status(400).json({ status: false, message: "month and year are required" });
    const fromdate = req.query.fromdate || null;
    const todate   = req.query.todate   || null;
    const result = await PayrollService.getMonthlyPayrollRun(month, year, { page, limit, search, fromdate, todate });
    res.status(200).json({
      status: true,
      currentPage: result.page,
      totalPages: Math.ceil(result.total / result.limit),
      totalCount: result.total,
      data: result.data,
    });
  } catch (err) {
    res.status(500).json({ status: false, message: err.message });
  }
};

export const updatePayrollStatus = async (req, res) => {
  try {
    const { status, transactionId, paymentDate } = req.body;
    const data = await PayrollService.updatePayrollStatus(req.params.id, status, transactionId, paymentDate);
    res.status(200).json({ status: true, message: "Payroll status updated", data });
  } catch (err) {
    res.status(err.statusCode || 500).json({ status: false, message: err.message });
  }
};

export const updateTax = async (req, res) => {
  try {
    const { taxAmount } = req.body;
    const data = await PayrollService.updateTax(req.params.id, taxAmount);
    res.status(200).json({ status: true, message: "TDS updated", data });
  } catch (err) {
    res.status(err.statusCode || 500).json({ status: false, message: err.message });
  }
};

export const getPayslip = async (req, res) => {
  try {
    // G1: ownership / permission gate — payslip exposes bank account, IFSC,
    // PAN and UAN. Caller must own the record OR have hr.payroll.read.
    const RoleModel = (await import("../../role/role.model.js")).default;
    const { PayrollModel } = await import("./payroll.model.js");
    const owner = await PayrollModel.findById(req.params.id).select("employeeId").lean();
    if (!owner) return res.status(404).json({ status: false, message: "Payroll record not found" });

    const isOwner = String(owner.employeeId) === String(req.user._id);
    if (!isOwner) {
      let allowed = false;
      if (req.user?.role) {
        const role = await RoleModel.findById(req.user.role).lean();
        allowed = !!role?.permissions?.hr?.payroll?.read;
      }
      if (!allowed) {
        return res.status(403).json({ status: false, message: "Not authorized to view this payslip" });
      }
    }

    const data = await PayrollService.getPayslip(req.params.id);
    res.status(200).json({ status: true, data });
  } catch (err) {
    res.status(err.statusCode || 500).json({ status: false, message: err.message });
  }
};

export const exportBankExcel = async (req, res) => {
  try {
    const { month, year } = req.query;
    if (!month || !year) return res.status(400).json({ status: false, message: "month and year are required" });

    const buffer = await PayrollService.exportBankExcel(month, year);

    const filename = `Payroll_${year}_${String(month).padStart(2, "0")}.xlsx`;
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (err) {
    res.status(err.statusCode || 500).json({ status: false, message: err.message });
  }
};
