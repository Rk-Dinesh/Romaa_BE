import { Router } from 'express';
import { refreshToken, signIn, signinCheck, signOut } from './auth.controller.js';

const authRoute = Router();

authRoute.post('/signin/check', signinCheck);
authRoute.post('/signin', signIn); //working
authRoute.post('/token/refresh',refreshToken);
authRoute.post('/signout', signOut);

export default authRoute;
