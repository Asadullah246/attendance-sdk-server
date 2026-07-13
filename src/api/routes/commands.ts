import { Router, Request, Response } from 'express';
import { CommandService } from '../../services/commandService';
import { successResponse, errorResponse } from '../../utils/helpers';
import logger from '../../utils/logger';

const router = Router();

/**
 * Helper to wrap async route handlers
 */
const asyncHandler = (fn: Function) => (req: Request, res: Response, next: Function) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * POST /api/v1/commands/reboot/:sn
 * Reboots the device with the given Serial Number
 */
router.post('/reboot/:sn', asyncHandler(async (req: Request, res: Response) => {
  const { sn } = req.params;
  const result = await CommandService.rebootDevice(sn);
  res.json(successResponse(result, `Reboot command queued for ${sn}`));
}));

/**
 * POST /api/v1/commands/unlock/:sn
 * Unlocks the door/turnstile for the device
 */
router.post('/unlock/:sn', asyncHandler(async (req: Request, res: Response) => {
  const { sn } = req.params;
  const result = await CommandService.unlockDoor(sn);
  res.json(successResponse(result, `Unlock command queued for ${sn}`));
}));

/**
 * POST /api/v1/commands/sync-time/:sn
 * Syncs the device clock to the server clock
 */
router.post('/sync-time/:sn', asyncHandler(async (req: Request, res: Response) => {
  const { sn } = req.params;
  const result = await CommandService.syncTime(sn);
  res.json(successResponse(result, `Sync-time command queued for ${sn}`));
}));

/**
 * POST /api/v1/commands/clear-log/:sn
 * Clears attendance logs on the device
 */
router.post('/clear-log/:sn', asyncHandler(async (req: Request, res: Response) => {
  const { sn } = req.params;
  const result = await CommandService.clearAttendanceLogs(sn);
  res.json(successResponse(result, `Clear-log command queued for ${sn}`));
}));

/**
 * GET /api/v1/commands/status/:id
 * Check the status of a specific command by ID
 */
router.get('/status/:id', asyncHandler(async (req: Request, res: Response) => {
  const commandId = parseInt(req.params.id, 10);
  if (isNaN(commandId)) {
    return res.status(400).json(errorResponse('Invalid command ID', 400));
  }

  const status = await CommandService.getCommandStatus(commandId);
  if (!status) {
    return res.status(404).json(errorResponse('Command not found', 404));
  }

  res.json(successResponse(status, 'Command status retrieved'));
}));

export default router;
