import { Router, Request, Response, NextFunction } from 'express';
import { ConfigService } from '../../services/configService';
import { successResponse, errorResponse } from '../../utils/helpers';

const router = Router();

const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) => 
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

/**
 * GET /api/v1/configs
 * Fetch all system configs
 */
router.get('/', asyncHandler(async (_req: Request, res: Response) => {
  const configs = await ConfigService.getAllConfigs();
  res.json(successResponse(configs, 'Configs fetched successfully'));
}));

/**
 * GET /api/v1/configs/:key
 * Fetch a specific config
 */
router.get('/:key', asyncHandler(async (req: Request, res: Response) => {
  const key = req.params.key as string;
  const value = await ConfigService.getConfig(key);

  if (value === null) {
    return res.status(404).json(errorResponse('Config not found', 404));
  }

  res.json(successResponse({ key, value }, 'Config fetched successfully'));
}));

/**
 * PUT /api/v1/configs/:key
 * Create or update a config
 */
router.put('/:key', asyncHandler(async (req: Request, res: Response) => {
  const key = req.params.key as string;
  const { value, description } = req.body;

  if (value === undefined) {
    return res.status(400).json(errorResponse('value is required', 400));
  }

  const config = await ConfigService.setConfig(key, value.toString(), description);
  res.json(successResponse(config, 'Config updated successfully'));
}));

export default router;
