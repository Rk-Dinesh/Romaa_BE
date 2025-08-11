import { Router } from 'express';
import {
  createEmployee,
  getEmployeeById,
  getAllEmployees,
  updateEmployeeById,
  deleteEmployeeById,
  markAttendance,
  updateAttendance,
  getAttendance,
} from './employee.controller.js';

const employeeRoute = Router();

employeeRoute.post('/addemployee', createEmployee);              // CREATE
employeeRoute.get('/getbyemployeeid', getEmployeeById);          // READ ONE
employeeRoute.get('/getallemployees', getAllEmployees);          // READ ALL
employeeRoute.put('/updatebyemployeeid', updateEmployeeById);    // UPDATE
employeeRoute.delete('/deletebyemployeeid', deleteEmployeeById); // DELETE
employeeRoute.post("/markattendance/:employee_id", markAttendance);
employeeRoute.put("/updateattendance/:employee_id", updateAttendance);
employeeRoute.get("/getattendance/:employee_id", getAttendance);

export default employeeRoute;
