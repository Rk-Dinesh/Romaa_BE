import jwt from 'jsonwebtoken';

import { ClientHeader, UserLevel } from './App.const.js';
import logger from '../config/logger.js';

const validateJWT = () => {
  return (req, res, next) => {
    const clientId = req.headers['x-client-id'] || '';
    if (!clientId) {
      return res.status(401).json({ message: 'Unauthorized - Missing x-client-id header.' });
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Unauthorized - No token provided' });
    }

    const token = authHeader.split(' ')[1];

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const userLevel = decoded?.level;

      // Only allow ADMIN with matching clientId
      if (userLevel !== UserLevel.ADMIN || clientId !== ClientHeader.ADMIN) {
        return res.status(403).json({ message: 'Unauthorized - Client mismatch or not ADMIN' });
      }

      req.user = decoded;
      next();
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        logger.error('Token expired: ' + error.message);
        return res.status(401).json({ message: 'Token expired' });
      } else {
        logger.error('Invalid token: ' + error.message);
        return res.status(403).json({ message: 'Forbidden: Invalid Token' });
      }
    }
  };
};

export default validateJWT;
