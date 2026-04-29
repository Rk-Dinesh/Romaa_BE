import { Router } from 'express';
import { refreshToken, signIn, signinCheck, signOut, updateOnboardingStatus } from './auth.controller.js';
import { verifyJWT } from '../../common/Auth.middlware.js';

const authRoute = Router();

authRoute.post('/signin/check', signinCheck);
authRoute.post('/signin', signIn); //working
authRoute.post('/token/refresh',refreshToken);
authRoute.post('/signout', signOut);
authRoute.patch('/update-onboarding-status', verifyJWT, updateOnboardingStatus);

export default authRoute;