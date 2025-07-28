import { Router } from 'express';
import {
  createEmployee,
  getEmployeeById,
  getAllEmployees,
  updateEmployeeById,
  deleteEmployeeById,
} from './employee.controller.js';

const employeeRoute = Router();

employeeRoute.post('/addemployee', createEmployee);              // CREATE
employeeRoute.get('/getbyemployeeid', getEmployeeById);          // READ ONE
employeeRoute.get('/getallemployees', getAllEmployees);          // READ ALL
employeeRoute.put('/updatebyemployeeid', updateEmployeeById);    // UPDATE
employeeRoute.delete('/deletebyemployeeid', deleteEmployeeById); // DELETE

export default employeeRoute;
