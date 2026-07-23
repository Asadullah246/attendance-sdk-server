import cron from 'node-cron';
import { getPrisma } from '../database/prisma';
import { WebhookService } from '../services/webhookService';
import { CommandService } from '../services/commandService';
import logger from '../utils/logger';

const prisma = getPrisma();

export class MaintenanceWorker {
  static start() {
    // 1. Device Offline Detection
    // Runs every minute to check if any online device hasn't sent a heartbeat in the last 3 minutes
    cron.schedule('* * * * *', async () => {
      try {
        const threeMinutesAgo = new Date(Date.now() - 1 * 60 * 1000);
        
        const offlineDevices = await prisma.device.updateMany({
          where: {
            isOnline: true,
            lastActivity: { lt: threeMinutesAgo }
          },
          data: {
            isOnline: false
          }
        });

        if (offlineDevices.count > 0) {
          logger.info(`[MaintenanceWorker] Marked ${offlineDevices.count} devices as offline due to inactivity.`);
        }
      } catch (error) {
        logger.error('[MaintenanceWorker] Error in device offline detection', { error: (error as Error).message });
      }
    });

    // 2. Database Cleanup
    // Runs daily at 2:00 AM to clean up old webhooks and commands
    cron.schedule('0 2 * * *', async () => {
      logger.info('[MaintenanceWorker] Starting daily database cleanup...');
      // Clean up webhooks older than 7 days
      await WebhookService.cleanupOldWebhooks(7);
      // Clean up commands older than 30 days
      await CommandService.cleanupOldCommands(30);
      logger.info('[MaintenanceWorker] Daily database cleanup completed.');
    });

    logger.info('[MaintenanceWorker] Initialized Device Offline Detection (every 1m) and Database Cleanup (daily at 2am)');
  }
}
