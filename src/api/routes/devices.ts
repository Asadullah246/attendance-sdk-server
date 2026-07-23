import { Router, Request, Response, NextFunction } from 'express';
import { getPrisma } from '../../database/prisma';
import { successResponse, errorResponse } from '../../utils/helpers';
import { buildUserInfoCommand, buildBiometricCommand } from '../../utils/commandBuilder';
import '../dtos/device.dto';

const router = Router();
const prisma = getPrisma();

const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) => 
  (req: Request, res: Response, next: NextFunction) => {
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
  const sn = req.params.sn as string;
  const device = await prisma.device.findUnique({
    where: { serialNumber: sn },
  });

  if (!device) {
    return res.status(404).json(errorResponse('Device not found', 404));
  }

  res.json(successResponse(device, 'Device fetched successfully'));
}));
/**
 * GET /api/v1/devices/:sn/sync-status
 * Get the list of users pending sync for a device
 */
router.get('/:sn/sync-status', asyncHandler(async (req: Request, res: Response) => {
  const sn = req.params.sn as string;
  const device = await prisma.device.findUnique({
    where: { serialNumber: sn },
    include: { area: true }
  });

  if (!device) {
    return res.status(404).json(errorResponse('Device not found', 404));
  }

  const pendingSyncs = await prisma.userDevice.findMany({
    where: {
      deviceId: device.id,
      syncedAt: null,
    },
    include: { user: true },
  });

  res.json(successResponse({
    pendingCount: pendingSyncs.length,
    pendingUsers: pendingSyncs.map(ps => ({
      uid: ps.user.uid,
      name: ps.user.name,
    })),
  }, 'Sync status fetched successfully'));
}));

/**
 * POST /api/v1/devices/:sn/retry-sync
 * Re-queue sync commands for all pending users on a device
 */
router.post('/:sn/retry-sync', asyncHandler(async (req: Request, res: Response) => {
  const sn = req.params.sn as string;
  const device = await prisma.device.findUnique({
    where: { serialNumber: sn },
  });

  if (!device) {
    return res.status(404).json(errorResponse('Device not found', 404));
  }

  const pendingSyncs = await prisma.userDevice.findMany({
    where: {
      deviceId: device.id,
      syncedAt: null,
    },
    include: { user: true },
  });

  let queuedCount = 0;
  for (const ps of pendingSyncs) {
    const user = ps.user;
    
    // Queue UserInfo update (TAB-separated per ADMS spec)
    const userCmd = buildUserInfoCommand(user.uid, user.name, user.privilege, user.cardNumber);
    await prisma.commandQueue.create({
      data: {
        deviceSn: device.serialNumber,
        commandType: 'UPDATE_USERINFO',
        commandData: userCmd,
        status: 'pending',
      }
    });

    // Queue Biometrics (BIODATA for face, templatev10 for fingerprint)
    const biometrics = await prisma.biometricTemplate.findMany({
      where: { uid: user.uid }
    });

    for (const bio of biometrics) {
      const bioCmd = buildBiometricCommand({
        uid: user.uid,
        type: bio.type,
        fingerId: bio.fingerId ?? 0,
        size: bio.size ?? 0,
        valid: bio.valid,
        template: bio.template,
        rawData: bio.rawData,
      });
      await prisma.commandQueue.create({
        data: {
          deviceSn: device.serialNumber,
          commandType: 'UPDATE_BIOMETRIC',
          commandData: bioCmd,
          status: 'pending',
        }
      });
    }
    
    queuedCount++;
  }

  res.json(successResponse({ queuedCount }, `Re-queued ${queuedCount} users for sync`));
}));

/**
 * PATCH /api/v1/devices/:sn
 * Update device (e.g., assign Area) and trigger initial user sync for that area
 */
router.patch('/:sn', asyncHandler(async (req: Request, res: Response) => {
  const sn = req.params.sn as string;
  const { name, areaId } = req.body;

  const device = await prisma.device.findUnique({ where: { serialNumber: sn } });
  if (!device) {
    return res.status(404).json(errorResponse('Device not found', 404));
  }

  const updatedDevice = await prisma.device.update({
    where: { serialNumber: sn },
    data: {
      name: name !== undefined ? name : undefined,
      areaId: areaId !== undefined ? areaId : undefined,
    },
  });

  // If area was assigned/changed, queue sync for users in that area
  if (areaId !== undefined && areaId !== device.areaId) {
    console.log(`[Sync] Device ${sn} assigned to Area ${areaId}. Queueing users...`);
    const usersInArea = await prisma.user.findMany({ where: { areaId: areaId } });
    
    let queuedCount = 0;
    for (const user of usersInArea) {
      // Create UserDevice tracking
      await prisma.userDevice.upsert({
        where: { userId_deviceId: { userId: user.id, deviceId: device.id } },
        create: { userId: user.id, deviceId: device.id, syncedAt: null },
        update: { syncedAt: null }
      });

      // Queue UserInfo update (TAB-separated per ADMS spec)
      const userCmd = buildUserInfoCommand(user.uid, user.name, user.privilege, user.cardNumber);
      await prisma.commandQueue.create({
        data: {
          deviceSn: device.serialNumber,
          commandType: 'UPDATE_USERINFO',
          commandData: userCmd,
          status: 'pending',
        }
      });

      // Queue Biometrics (BIODATA for face, templatev10 for fingerprint)
      const biometrics = await prisma.biometricTemplate.findMany({ where: { uid: user.uid } });
      for (const bio of biometrics) {
        const bioCmd = buildBiometricCommand({
          uid: user.uid,
          type: bio.type,
          fingerId: bio.fingerId ?? 0,
          size: bio.size ?? 0,
          valid: bio.valid,
          template: bio.template,
          rawData: bio.rawData,
        });
        await prisma.commandQueue.create({
          data: {
            deviceSn: device.serialNumber,
            commandType: 'UPDATE_BIOMETRIC',
            commandData: bioCmd,
            status: 'pending',
          }
        });
      }
      queuedCount++;
    }
    console.log(`[Sync] Queued ${queuedCount} users for device ${sn}`);
  }

  res.json(successResponse(updatedDevice, 'Device updated successfully'));
}));

export default router;
