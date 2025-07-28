import { Router } from 'express';
import {  createRole, deleteRoleById, getAllRoles, getRoleById, updateRoleById } from './role.controller.js';

const roleRoute = Router();

roleRoute.post('/addrole',createRole); //working
roleRoute.get('/getbyroleid',getRoleById); //working
roleRoute.get('/getallroles',getAllRoles); //working
roleRoute.put('/updatebyroleid', updateRoleById); //working
roleRoute.delete('/deletebyroleid', deleteRoleById); //working

export default roleRoute;