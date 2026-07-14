import { Router, Request, Response, NextFunction } from 'express';
import { ConfigService } from '../../services/configService';
import { successResponse, errorResponse } from '../../utils/helpers';
import { validateRequest } from '../middleware/validate';
import { GetConfigParamsSchema, UpdateConfigBodySchema } from '../dtos/config.dto';
import { z } from 'zod';

const router = Router();

const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) => 
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

router.get('/', asyncHandler(async (_req: Request, res: Response) => {
  const configs = await ConfigService.getAllConfigs();
  res.json(successResponse(configs, 'Configs fetched successfully'));
}));

router.get('/:key', 
  validateRequest(z.object({ params: GetConfigParamsSchema })),
  asyncHandler(async (req: Request, res: Response) => {
    const key = req.params.key as string;
    const value = await ConfigService.getConfig(key);

    if (value === null) {
      return res.status(404).json(errorResponse('Config not found', 404));
    }

    res.json(successResponse({ key, value }, 'Config fetched successfully'));
  })
);

router.put('/:key', 
  validateRequest(z.object({ 
    params: GetConfigParamsSchema, 
    body: UpdateConfigBodySchema 
  })),
  asyncHandler(async (req: Request, res: Response) => {
    const key = req.params.key as string;
    const { value, description } = req.body;

    const config = await ConfigService.setConfig(key, value.toString(), description);
    res.json(successResponse(config, 'Config updated successfully'));
  })
);

export default router;
