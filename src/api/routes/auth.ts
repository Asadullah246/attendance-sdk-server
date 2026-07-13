import { Router, Request, Response } from 'express';
import config from '../../config';
import { successResponse, errorResponse } from '../../utils/helpers';
import logger from '../../utils/logger';

const router = Router();

/**
 * POST /api/v1/auth/login
 * Simple login for the Admin Dashboard
 */
router.post('/login', (req: Request, res: Response) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json(errorResponse('Email and password are required', 400));
  }

  if (email === config.adminEmail && password === config.adminPassword) {
    logger.info(`[Auth] Successful login for admin: ${email}`);
    // Return the API key to the frontend so it can store it in localStorage
    return res.json(successResponse({ apiKey: config.apiKey }, 'Login successful'));
  }

  logger.warn(`[Auth] Failed login attempt for email: ${email}`);
  return res.status(401).json(errorResponse('Invalid email or password', 401));
});

export default router;
