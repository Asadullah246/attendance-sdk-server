import { Router, Request, Response } from 'express';
import { getPrisma } from '../../database/prisma';
import { CommandService } from '../../services/commandService';
import { successResponse, errorResponse } from '../../utils/helpers';
import logger from '../../utils/logger';

const router = Router();
const prisma = getPrisma();

const asyncHandler = (fn: Function) => (req: Request, res: Response, next: Function) => {
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

  if (uid === undefined || !name || !deviceSn) {
    return res.status(400).json(errorResponse('uid, name, and deviceSn are required', 400));
  }

  // 1. Save to database
  const user = await prisma.user.upsert({
    where: { id: parseInt(uid, 10) },
    create: {
      uid: parseInt(uid, 10),
      name,
      privilege: privilege ? parseInt(privilege, 10) : 0,
    },
    update: {
      name,
      privilege: privilege ? parseInt(privilege, 10) : 0,
    }
  });

  // 2. Queue command to device
  await CommandService.addUser(
    deviceSn, 
    user.uid, 
    user.name, 
    user.privilege
  );

  res.json(successResponse(user, `User ${user.name} created and command queued for ${deviceSn}`));
}));

/**
 * DELETE /api/v1/users/:uid
 * Deletes a user from the database AND removes them from the specified device
 */
router.delete('/:uid', asyncHandler(async (req: Request, res: Response) => {
  const { uid } = req.params;
  const { deviceSn } = req.query; // Send deviceSn as a query param for DELETE

  if (!deviceSn) {
    return res.status(400).json(errorResponse('deviceSn query parameter is required', 400));
  }

  const numericUid = parseInt(uid, 10);

  // 1. Delete from database (ignore if not found)
  try {
    await prisma.user.delete({
      where: { id: numericUid }
    });
  } catch (e) {
    // Record might not exist, which is fine
  }

  // 2. Queue delete command to device
  await CommandService.deleteUser(deviceSn as string, numericUid);

  res.json(successResponse(null, `User ${numericUid} deleted and removal command queued for ${deviceSn}`));
}));

export default router;
