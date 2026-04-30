import { Router } from "express";
import {
  generatePayroll,
  bulkGeneratePayroll,
  getMyPayroll,
  getEmployeePayroll,
  getMonthlyPayrollRun,
  updatePayrollStatus,
  updateTax,
  exportBankExcel,
  getPayslip,
} from "./payroll.controller.js";
import { verifyJWT, verifyPermission } from "../../../common/Auth.middlware.js";

const PayrollRoute = Router();

// Employee — view own payslips
PayrollRoute.get("/my-payslips", verifyJWT, getMyPayroll);
// Structured payslip JSON (employee or HR — controller is permission-light;
// frontend renders this to PDF).
PayrollRoute.get("/payslip/:id", verifyJWT, getPayslip);

// HR admin actions
PayrollRoute.post("/generate",          verifyJWT, verifyPermission("hr", "payroll", "create"), generatePayroll);
PayrollRoute.post("/bulk-generate",     verifyJWT, verifyPermission("hr", "payroll", "create"), bulkGeneratePayroll);
PayrollRoute.get("/monthly-run",        verifyJWT, verifyPermission("hr", "payroll", "read"),   getMonthlyPayrollRun);
PayrollRoute.get("/employee/:employeeId", verifyJWT, verifyPermission("hr", "payroll", "read"), getEmployeePayroll);
PayrollRoute.put("/status/:id",         verifyJWT, verifyPermission("hr", "payroll", "edit"),   updatePayrollStatus);
PayrollRoute.put("/tax/:id",            verifyJWT, verifyPermission("hr", "payroll", "edit"),   updateTax);
PayrollRoute.get("/export-excel",       verifyJWT, verifyPermission("hr", "payroll", "read"),   exportBankExcel);

export default PayrollRoute;
