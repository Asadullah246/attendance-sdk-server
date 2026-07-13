import { Router, Request, Response } from 'express';
import { getPrisma } from '../../database/prisma';
import { successResponse, errorResponse } from '../../utils/helpers';
import logger from '../../utils/logger';

const router = Router();
const prisma = getPrisma();

const asyncHandler = (fn: Function) => (req: Request, res: Response, next: Function) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * GET /api/v1/devices
 * Get a list of all devices
 */
router.get('/', asyncHandler(async (_req: Request, res: Response) => {
  const devices = await prisma.device.findMany({
    orderBy: { lastActivity: 'desc' },
  });
  res.json(successResponse(devices, 'Devices fetched successfully'));
}));

/**
 * GET /api/v1/devices/:sn
 * Get details of a single device
 */
router.get('/:sn', asyncHandler(async (req: Request, res: Response) => {
  const { sn } = req.params;
  const device = await prisma.device.findUnique({
    where: { serialNumber: sn },
  });

  if (!device) {
    return res.status(404).json(errorResponse('Device not found', 404));
  }

  res.json(successResponse(device, 'Device fetched successfully'));
}));

export default router;
