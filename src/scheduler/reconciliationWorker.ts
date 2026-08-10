import cron from 'node-cron';
import { ReconciliationService } from '../services/reconciliationService';
import logger from '../utils/logger';

/**
 * ReconciliationWorker
 * 
 * Runs a periodic cron job to ensure all online devices mirror the SDK database.
 * Schedule: Every 6 hours (at minute 0)
 * 
 * This catches:
 * - Users accidentally deleted from devices
 * - Users with stuck "pending_add" / "pending_update" status
 * - New devices that came online after users were created
 */
export class ReconciliationWorker {
  static start() {
    // Run every 6 hours: at 00:00, 06:00, 12:00, 18:00
    cron.schedule('0 */6 * * *', async () => {
      logger.info('[ReconciliationWorker] Starting scheduled device reconciliation...');
      
      try {
        const result = await ReconciliationService.reconcileAllDevices();
        logger.info(`[ReconciliationWorker] Reconciliation complete — ${result.devicesProcessed} devices, ${result.usersRequeued} users re-queued`);
      } catch (error) {
        logger.error('[ReconciliationWorker] Error during reconciliation', {
          error: (error as Error).message,
        });
      }
    });

    logger.info('[ReconciliationWorker] Initialized (runs every 6 hours at 00:00, 06:00, 12:00, 18:00)');
  }
}
