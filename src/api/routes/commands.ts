import { Router, Request, Response, NextFunction } from 'express';
import { CommandService } from '../../services/commandService';
import { successResponse, errorResponse } from '../../utils/helpers';

const router = Router();

/**
 * Helper to wrap async route handlers
 */
const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) => 
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

/**
 * GET /api/v1/commands
 * Fetch recent commands for the Sync Logs dashboard
 */
router.get('/', asyncHandler(async (_req: Request, res: Response) => {
  const commands = await CommandService.getAllCommands(50);
  res.json(successResponse(commands, 'Commands fetched successfully'));
}));

/**
 * POST /api/v1/commands/reboot/:sn
 * Reboots the device with the given Serial Number
 */
router.post('/reboot/:sn', asyncHandler(async (req: Request, res: Response) => {
  const sn = req.params.sn as string;
  const result = await CommandService.rebootDevice(sn);
  res.json(successResponse(result, `Reboot command queued for ${sn}`));
}));

/**
 * POST /api/v1/commands/unlock/:sn
 * Unlocks the door/turnstile for the device
 */
router.post('/unlock/:sn', asyncHandler(async (req: Request, res: Response) => {
  const sn = req.params.sn as string;
  const result = await CommandService.unlockDoor(sn);
  res.json(successResponse(result, `Unlock command queued for ${sn}`));
}));

/**
 * POST /api/v1/commands/sync-time/:sn
 * Syncs the device clock to the server clock
 */
router.post('/sync-time/:sn', asyncHandler(async (req: Request, res: Response) => {
  const sn = req.params.sn as string;
  const result = await CommandService.syncTime(sn);
  res.json(successResponse(result, `Sync-time command queued for ${sn}`));
}));

/**
 * POST /api/v1/commands/clear-log/:sn
 * Clears attendance logs on the device
 */
router.post('/clear-log/:sn', asyncHandler(async (req: Request, res: Response) => {
  const sn = req.params.sn as string;
  const result = await CommandService.clearAttendanceLogs(sn);
  res.json(successResponse(result, `Clear-log command queued for ${sn}`));
}));

/**
 * GET /api/v1/commands/status/:id
 * Check the status of a specific command by ID
 */
router.get('/status/:id', asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const commandId = parseInt(id, 10);
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
