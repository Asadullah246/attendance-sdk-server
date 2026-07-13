import { Router, Request, Response, NextFunction } from 'express';
import { getPrisma } from '../../database/prisma';
import { CommandService } from '../../services/commandService';
import { successResponse, errorResponse } from '../../utils/helpers';

const router = Router();
const prisma = getPrisma();

const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) => 
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

/**
 * GET /api/v1/users
 * Fetch all enrolled users from the database
 */
router.get('/', asyncHandler(async (_req: Request, res: Response) => {
  const users = await prisma.user.findMany({
    orderBy: { uid: 'asc' },
  });
  res.json(successResponse(users, 'Users fetched successfully'));
}));

/**
 * POST /api/v1/users
 * Creates a new user in the database AND pushes it to the specified device
 */
router.post('/', asyncHandler(async (req: Request, res: Response) => {
  const { uid, name, privilege, deviceSn } = req.body;

  if (uid === undefined || !name) {
    return res.status(400).json(errorResponse('uid and name are required', 400));
  }

  // 1. Save to database
  const user = await prisma.user.upsert({
    where: { id: parseInt(uid, 10) },
    create: {
      uid: parseInt(uid, 10),
      name,
      privilege: privilege ? parseInt(privilege, 10) : 0,
      status: 'pending_add',
    },
    update: {
      name,
      privilege: privilege ? parseInt(privilege, 10) : 0,
      status: 'pending_add',
    }
  });

  // 2. Queue command to device(s)
  if (!deviceSn) {
    // Global Access: Push to ALL devices
    const devices = await prisma.device.findMany({ where: { isOnline: true } });
    if (devices.length === 0) {
      return res.status(400).json(errorResponse('No online devices found to sync user to', 400));
    }
    for (const device of devices) {
      await CommandService.addUser(device.serialNumber, user.uid, user.name, user.privilege);
    }
    res.json(successResponse({ user }, `User ${user.name} created and command queued for all devices`));
  } else {
    // Zone Access: Push to a specific device
    const cmdResult = await CommandService.addUser(
      deviceSn, 
      user.uid, 
      user.name, 
      user.privilege
    );
    res.json(successResponse({ user, commandId: cmdResult.commandId }, `User ${user.name} created and command queued for ${deviceSn}`));
  }
}));

/**
 * DELETE /api/v1/users/:uid
 * Deletes a user from the database AND removes them from the specified device
 */
router.delete('/:uid', asyncHandler(async (req: Request, res: Response) => {
  const uid = req.params.uid as string;
  const { deviceSn } = req.query; // Send deviceSn as a query param for DELETE

  const numericUid = parseInt(uid, 10);

  // 1. Update status to pending_delete (ignore if not found)
  try {
    await prisma.user.update({
      where: { id: numericUid },
      data: { status: 'pending_delete' }
    });
  } catch (e) {
    // Record might not exist, which is fine
  }

  // 2. Queue delete command to device(s)
  if (!deviceSn) {
    // Delete from ALL devices
    const devices = await prisma.device.findMany();
    if (devices.length === 0) {
      return res.status(400).json(errorResponse('No connected devices found in the system', 400));
    }
    for (const device of devices) {
      await CommandService.deleteUser(device.serialNumber, numericUid);
    }
    return res.json(successResponse(null, `User ${numericUid} deletion queued for all devices`));
  } else {
    // Delete from specific device
    const cmdResult = await CommandService.deleteUser(deviceSn as string, numericUid);
    return res.json(successResponse({ commandId: cmdResult.commandId }, `User ${numericUid} deleted and removal command queued for ${deviceSn}`));
  }
}));

export default router;
