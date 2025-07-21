import { Router } from 'express';
import { createRole, getRoleById } from './role.controller.js';

const roleRoute = Router();

roleRoute.post('/addrole',createRole);
roleRoute.get('/getbyroleid/:id',getRoleById);

export default roleRoute;