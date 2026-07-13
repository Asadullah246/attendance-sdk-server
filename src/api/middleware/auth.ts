import { Request, Response, NextFunction } from 'express';
import config from '../../config';

/**
 * Middleware to protect SDK Server APIs.
 * Requires the 'x-api-key' header to match the server's configured API_KEY.
 */
export const requireApiKey = (req: Request, res: Response, next: NextFunction) => {
  const providedKey = req.headers['x-api-key'];

  if (!providedKey) {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized: Missing x-api-key header',
    });
  }

  if (providedKey !== config.apiKey) {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized: Invalid API Key',
    });
  }

  next();
};
