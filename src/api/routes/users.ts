import { Router, Request, Response, NextFunction } from 'express';
import { getPrisma } from '../../database/prisma';
import { CommandService } from '../../services/commandService';
import { ReconciliationService } from '../../services/reconciliationService';
import { successResponse, errorResponse } from '../../utils/helpers';
import { validateRequest } from '../middleware/validate';
import { CreateUserBodySchema, DeleteUserParamSchema } from '../dtos/user.dto';
import { z } from 'zod';
import logger from '../../utils/logger';

const router = Router();
const prisma = getPrisma();

const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) => 
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

/**
 * Helper: Queue a user (+ their biometrics) to devices in the background.
 * Does NOT await device response — just inserts into CommandQueue.
 */
async function queueUserToDevices(user: { id: number; uid: number; name: string; privilege: number; cardNumber: string | null }, deviceSn?: string) {
  // Fetch existing biometric templates for this user
  const biometrics = await prisma.biometricTemplate.findMany({ where: { uid: user.uid } });

  if (!deviceSn) {
    // Global Access: Push to ALL online devices
    const devices = await prisma.device.findMany({ where: { isOnline: true } });
    if (devices.length === 0) {
      logger.warn(`[Users] No online devices found to sync user ${user.uid} to`);
      return;
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

    await CommandService.addUser(deviceSn, user.uid, user.name, user.privilege, user.cardNumber);

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
  }
}

// ─── GET /api/v1/users ──────────────────────────────────────────────
router.get('/', asyncHandler(async (_req: Request, res: Response) => {
  const users = await prisma.user.findMany({
    orderBy: { uid: 'asc' },
  });
  res.json(successResponse(users, 'Users fetched successfully'));
}));

// ─── GET /api/v1/users/:uid ─────────────────────────────────────────
// Returns a single user by UID with their sync status per device
router.get('/:uid', asyncHandler(async (req: Request, res: Response) => {
  const uid = parseInt(req.params.uid as string, 10);
  if (isNaN(uid)) {
    return res.status(400).json(errorResponse('Invalid UID', 400));
  }

  const user = await prisma.user.findUnique({
    where: { uid },
    include: {
      userDevices: {
        include: { device: { select: { serialNumber: true, name: true, isOnline: true } } }
      }
    }
  });

  if (!user) {
    return res.json(successResponse(null, 'User not found in SDK'));
  }

  return res.json(successResponse(user, 'User fetched successfully'));
}));

// ─── POST /api/v1/users ─────────────────────────────────────────────
// Smart sync: create if new, update if changed, skip if already synced
router.post('/', 
  validateRequest(z.object({ body: CreateUserBodySchema })),
  asyncHandler(async (req: Request, res: Response) => {
    const { uid, name, privilege, deviceSn, defaultTimetableId, overwrite, cardNumber } = req.body;
    const numericUid = parseInt(uid, 10);
    const numericPrivilege = privilege ? parseInt(privilege, 10) : 0;

    // Check if user already exists in SDK DB
    const existingUser = await prisma.user.findUnique({ where: { uid: numericUid } });

    // ─── CASE 1: New user — create + queue to devices ────────────
    if (!existingUser) {
      const user = await prisma.user.create({
        data: {
          uid: numericUid,
          name,
          privilege: numericPrivilege,
          status: 'pending_add',
          defaultTimetableId: defaultTimetableId ?? null,
          cardNumber: cardNumber ?? null,
        }
      });

      // Queue to devices in background (non-blocking — just DB inserts to CommandQueue)
      queueUserToDevices(user, deviceSn).catch(err => {
        logger.error(`[Users] Failed to queue user ${numericUid} to devices`, { error: err.message });
      });

      return res.status(201).json(successResponse(
        { user },
        `User ${user.name} created and queued for device sync`
      ));
    }

    // ─── CASE 2: Exists + overwrite — compare fields ─────────────
    if (overwrite) {
      const needsUpdate = (
        existingUser.name !== name ||
        existingUser.cardNumber !== (cardNumber ?? null) ||
        existingUser.privilege !== numericPrivilege ||
        existingUser.defaultTimetableId !== (defaultTimetableId ?? null)
      );

      if (!needsUpdate) {
        return res.json(successResponse(
          { user: existingUser },
          'User already synced, no changes needed'
        ));
      }

      // Fields differ — update DB + re-queue to devices
      const user = await prisma.user.update({
        where: { uid: numericUid },
        data: {
          name,
          privilege: numericPrivilege,
          status: 'pending_update',
          defaultTimetableId: defaultTimetableId ?? null,
          cardNumber: cardNumber ?? null,
        }
      });

      // Queue to devices in background
      queueUserToDevices(user, deviceSn).catch(err => {
        logger.error(`[Users] Failed to queue user ${numericUid} update to devices`, { error: err.message });
      });

      return res.json(successResponse(
        { user },
        `User ${user.name} updated and re-queued for device sync`
      ));
    }

    // ─── CASE 3: Exists + no overwrite — do nothing ──────────────
    return res.json(successResponse(
      { user: existingUser },
      'User already synced'
    ));
  })
);

// ─── POST /api/v1/users/bulk ────────────────────────────────────────
// Bulk sync: same 3-case logic applied per user
const BulkCreateUsersBodySchema = z.object({
  users: z.array(z.object({
    uid: z.string(),
    name: z.string(),
    cardNumber: z.string().optional(),
    privilege: z.string().optional(),
  })).min(1).max(500),
  overwrite: z.boolean().optional(),
  deviceSn: z.string().optional(),
});

router.post('/bulk',
  validateRequest(z.object({ body: BulkCreateUsersBodySchema })),
  asyncHandler(async (req: Request, res: Response) => {
    const { users, overwrite, deviceSn } = req.body;
    
    const results = {
      total: users.length,
      created: 0,
      updated: 0,
      unchanged: 0,
      errors: 0,
      details: [] as { uid: number; action: string; status: string; changes?: string[]; error?: string }[],
    };

    for (const userData of users) {
      const numericUid = parseInt(userData.uid, 10);
      const numericPrivilege = userData.privilege ? parseInt(userData.privilege, 10) : 0;
      const cardNum = userData.cardNumber ?? null;

      try {
        const existingUser = await prisma.user.findUnique({ where: { uid: numericUid } });

        // CASE 1: New user
        if (!existingUser) {
          const user = await prisma.user.create({
            data: {
              uid: numericUid,
              name: userData.name,
              privilege: numericPrivilege,
              status: 'pending_add',
              cardNumber: cardNum,
            }
          });

          // Queue in background
          queueUserToDevices(user, deviceSn).catch(err => {
            logger.error(`[Users Bulk] Failed to queue user ${numericUid}`, { error: err.message });
          });

          results.created++;
          results.details.push({ uid: numericUid, action: 'created', status: 'pending_add' });
          continue;
        }

        // CASE 2: Exists + overwrite
        if (overwrite) {
          const changes: string[] = [];
          if (existingUser.name !== userData.name) changes.push('name');
          if (existingUser.cardNumber !== cardNum) changes.push('cardNumber');
          if (existingUser.privilege !== numericPrivilege) changes.push('privilege');

          if (changes.length === 0) {
            results.unchanged++;
            results.details.push({ uid: numericUid, action: 'unchanged', status: existingUser.status });
            continue;
          }

          const user = await prisma.user.update({
            where: { uid: numericUid },
            data: {
              name: userData.name,
              privilege: numericPrivilege,
              status: 'pending_update',
              cardNumber: cardNum,
            }
          });

          // Queue in background
          queueUserToDevices(user, deviceSn).catch(err => {
            logger.error(`[Users Bulk] Failed to queue user ${numericUid} update`, { error: err.message });
          });

          results.updated++;
          results.details.push({ uid: numericUid, action: 'updated', status: 'pending_update', changes });
          continue;
        }

        // CASE 3: Exists + no overwrite
        results.unchanged++;
        results.details.push({ uid: numericUid, action: 'unchanged', status: existingUser.status });

      } catch (err) {
        results.errors++;
        results.details.push({
          uid: numericUid,
          action: 'error',
          status: 'error',
          error: (err as Error).message,
        });
        logger.error(`[Users Bulk] Error processing user ${numericUid}`, { error: (err as Error).message });
      }
    }

    // Trigger reconciliation in the background so it catches any missed sync states immediately
    ReconciliationService.reconcileAllDevices().catch(err => {
      logger.error(`[Users Bulk] Background reconciliation failed`, { error: err.message });
    });

    const msg = `Bulk sync complete: ${results.created} created, ${results.updated} updated, ${results.unchanged} unchanged, ${results.errors} errors`;
    res.json(successResponse(results, msg));
  })
);

// ─── DELETE /api/v1/users/:uid ──────────────────────────────────────
router.delete('/:uid', 
  validateRequest(z.object({ params: DeleteUserParamSchema })),
  asyncHandler(async (req: Request, res: Response) => {
    const uid = req.params.uid as string;
    const numericUid = parseInt(uid, 10);

    // 1. Update status to pending_delete (ignore if not found)
    try {
      await prisma.user.update({
        where: { uid: numericUid },
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
