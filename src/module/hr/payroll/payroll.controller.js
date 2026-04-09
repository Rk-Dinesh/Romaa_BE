import PayrollService from "./payroll.service.js";

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
    const { year } = req.query;
    const data = await PayrollService.getEmployeePayroll(req.params.employeeId, year);
    res.status(200).json({ status: true, data });
  } catch (err) {
    res.status(500).json({ status: false, message: err.message });
  }
};

export const getMonthlyPayrollRun = async (req, res) => {
  try {
    const { month, year } = req.query;
    if (!month || !year) return res.status(400).json({ status: false, message: "month and year are required" });
    const data = await PayrollService.getMonthlyPayrollRun(month, year);
    res.status(200).json({ status: true, data });
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
