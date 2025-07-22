import { Router } from 'express';
import { updateUser, deleteUser, getUserDetail, register, getAllUser } from './user.controller.js';
import validateJWT from '../../common/Route.filter.js';
import { PERMISSIONS } from '../../common/App.const.js';

const userRoute = Router();

userRoute.post('/adduser', register); //working
userRoute.put('/updateuser/:id', updateUser);
userRoute.get('/getuserdetail/:id',validateJWT([ PERMISSIONS.READ, PERMISSIONS.ALL]), getUserDetail); //working
userRoute.delete('/deleteuser/:id', deleteUser);
userRoute.get('/getallusers',validateJWT([ PERMISSIONS.READ, PERMISSIONS.ALL]), getAllUser); // Have to check

export default userRoute;