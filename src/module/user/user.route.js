import { Router } from 'express';
import { updateUser, deleteUser, getUserDetail, register, getAllUser } from './user.controller.js';

const userRoute = Router();

userRoute.post('/adduser', register);
userRoute.put('/updateuser/:id', updateUser);
userRoute.get('/getuserdetail/:id', getUserDetail);
userRoute.delete('/deleteuser/:id', deleteUser);
userRoute.get('/getallusers', getAllUser);

export default userRoute;