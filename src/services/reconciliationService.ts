import { getPrisma } from '../database/prisma';
import { CommandService } from './commandService';
import logger from '../utils/logger';

const prisma = getPrisma();

/**
 * ReconciliationService
 * 
 * Ensures all devices mirror the SDK server database (source of truth).
 * For each online device, checks every user in the DB and verifies they
 * have been synced to the device (via UserDevice.syncedAt).
 * 
 * - Users missing from device (no UserDevice record or syncedAt = null) → re-queue add_user
 * - Users with pending status → re-queue add_user
 * - Never creates users from device data — SDK DB is source of truth
 */
export class ReconciliationService {

  /**
   * Reconcile all online devices with the SDK database.
   * For each device, ensure every active user in the DB is synced to it.
   */
  static async reconcileAllDevices(): Promise<{ devicesProcessed: number; usersRequeued: number }> {
    const startTime = Date.now();
    let devicesProcessed = 0;
    let usersRequeued = 0;

    try {
      const devices = await prisma.device.findMany({ where: { isOnline: true } });
      if (devices.length === 0) {
        logger.info('[Reconciliation] No online devices found. Skipping reconciliation.');
        return { devicesProcessed: 0, usersRequeued: 0 };
      }

      // Get all users that should be on devices (not pending delete)
      const allUsers = await prisma.user.findMany({
        where: { status: { not: 'pending_delete' } },
      });

      logger.info(`[Reconciliation] Starting reconciliation for ${devices.length} devices and ${allUsers.length} users`);

      for (const device of devices) {
        let deviceRequeued = 0;

        for (const user of allUsers) {
          try {
            // Check if user is confirmed synced to this device
            const userDevice = await prisma.userDevice.findUnique({
              where: { userId_deviceId: { userId: user.id, deviceId: device.id } }
            });

            // If UserDevice record doesn't exist OR syncedAt is null, user needs to be synced
            const needsSync = !userDevice || userDevice.syncedAt === null;

            // Also re-sync if user has a pending status (something changed)
            const hasPendingStatus = user.status === 'pending_add' || user.status === 'pending_update';

            if (needsSync || hasPendingStatus) {
              // Ensure UserDevice tracking exists
              await prisma.userDevice.upsert({
                where: { userId_deviceId: { userId: user.id, deviceId: device.id } },
                create: { userId: user.id, deviceId: device.id, syncedAt: null },
                update: {} // Don't overwrite syncedAt if it exists (it's null anyway if we're here)
              });

              // Queue add_user command
              await CommandService.addUser(
                device.serialNumber,
                user.uid,
                user.name,
                user.privilege,
                user.cardNumber
              );

              // Also queue biometric templates
              const biometrics = await prisma.biometricTemplate.findMany({ where: { uid: user.uid } });
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

              deviceRequeued++;
              usersRequeued++;
            }
          } catch (err) {
            logger.error(`[Reconciliation] Error processing user ${user.uid} for device ${device.serialNumber}`, {
              error: (err as Error).message,
            });
          }
        }

        if (deviceRequeued > 0) {
          logger.info(`[Reconciliation] Device ${device.serialNumber}: re-queued ${deviceRequeued} users`);
        }
        devicesProcessed++;
      }

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      logger.info(`[Reconciliation] Complete in ${elapsed}s — ${devicesProcessed} devices, ${usersRequeued} users re-queued`);

    } catch (err) {
      logger.error('[Reconciliation] Fatal error during reconciliation', {
        error: (err as Error).message,
        stack: (err as Error).stack,
      });
    }

    return { devicesProcessed, usersRequeued };
  }
}
