import { Router, Request, Response, NextFunction } from 'express';
import { getPrisma } from '../../database/prisma';
import { CommandService } from '../../services/commandService';
import { successResponse, errorResponse } from '../../utils/helpers';
import { validateRequest } from '../middleware/validate';
import { CreateUserBodySchema, DeleteUserParamSchema } from '../dtos/user.dto';
import { z } from 'zod';

const router = Router();
const prisma = getPrisma();

const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) => 
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

router.get('/', asyncHandler(async (_req: Request, res: Response) => {
  const users = await prisma.user.findMany({
    orderBy: { uid: 'asc' },
  });
  res.json(successResponse(users, 'Users fetched successfully'));
}));

router.post('/', 
  validateRequest(z.object({ body: CreateUserBodySchema })),
  asyncHandler(async (req: Request, res: Response) => {
    const { uid, name, privilege, deviceSn, defaultTimetableId } = req.body;
    const numericUid = parseInt(uid, 10);

    // 1. Save to database (use uid, NOT id — id is the auto-increment PK)
    const user = await prisma.user.upsert({
      where: { uid: numericUid },
      create: {
        uid: numericUid,
        name,
        privilege: privilege ? parseInt(privilege, 10) : 0,
        status: 'pending_add',
        defaultTimetableId: defaultTimetableId ?? null
      },
      update: {
        name,
        privilege: privilege ? parseInt(privilege, 10) : 0,
        status: 'pending_add',
        defaultTimetableId: defaultTimetableId ?? null
      }
    });

    // 2. Fetch existing biometric templates for this user (if any)
    const biometrics = await prisma.biometricTemplate.findMany({ where: { uid: numericUid } });

    // 3. Queue command to device(s)
    if (!deviceSn) {
      // Global Access: Push to ALL devices
      const devices = await prisma.device.findMany({ where: { isOnline: true } });
      if (devices.length === 0) {
        return res.status(400).json(errorResponse('No online devices found to sync user to', 400));
      }
      for (const device of devices) {
        // Track sync state
        await prisma.userDevice.upsert({
          where: { userId_deviceId: { userId: user.id, deviceId: device.id } },
          create: { userId: user.id, deviceId: device.id, syncedAt: null },
          update: { syncedAt: null }
        });

        await CommandService.addUser(device.serialNumber, user.uid, user.name, user.privilege, user.cardNumber);

        // Push biometric templates too
        for (const bio of biometrics) {
          await CommandService.addBiometric(device.serialNumber, {
            uid: user.uid,
            type: bio.type,
            fingerId: bio.fingerId ?? 0,
            size: bio.size ?? 0,
            valid: bio.valid,
            template: bio.template,
            rawData: bio.rawData,
          });
        }
      }
      res.json(successResponse({ user }, `User ${user.name} created and command queued for all devices`));
    } else {
      // Zone Access: Push to a specific device
      const device = await prisma.device.findUnique({ where: { serialNumber: deviceSn } });
      if (device) {
        await prisma.userDevice.upsert({
          where: { userId_deviceId: { userId: user.id, deviceId: device.id } },
          create: { userId: user.id, deviceId: device.id, syncedAt: null },
          update: { syncedAt: null }
        });
      }

      const cmdResult = await CommandService.addUser(
        deviceSn, 
        user.uid, 
        user.name, 
        user.privilege,
        user.cardNumber
      );

      // Push biometric templates too
      for (const bio of biometrics) {
        await CommandService.addBiometric(deviceSn, {
          uid: user.uid,
          type: bio.type,
          fingerId: bio.fingerId ?? 0,
          size: bio.size ?? 0,
          valid: bio.valid,
          template: bio.template,
          rawData: bio.rawData,
        });
      }

      res.json(successResponse({ user, commandId: cmdResult.commandId }, `User ${user.name} created and command queued for ${deviceSn}`));
    }
  })
);

router.delete('/:uid', 
  validateRequest(z.object({ params: DeleteUserParamSchema })),
  asyncHandler(async (req: Request, res: Response) => {
    const uid = req.params.uid as string;
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

    // 2. Queue delete command to ALL devices
    const devices = await prisma.device.findMany();
    if (devices.length === 0) {
      return res.status(400).json(errorResponse('No connected devices found in the system', 400));
    }
    
    for (const device of devices) {
      await CommandService.deleteUser(device.serialNumber, numericUid);
    }
    
    return res.json(successResponse(null, `User ${numericUid} deletion queued for all devices`));
  })
);

export default router;
