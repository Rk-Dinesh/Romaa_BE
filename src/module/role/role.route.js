import { Router } from 'express';
import {  createRole, getAllRoles, getRoleById } from './role.controller.js';

const roleRoute = Router();

roleRoute.post('/addrole',createRole); //working
roleRoute.get('/getbyroleid',getRoleById); //working
roleRoute.get('/getallroles',getAllRoles); //working

export default roleRoute;