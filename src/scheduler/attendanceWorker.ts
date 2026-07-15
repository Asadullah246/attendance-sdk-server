import * as cron from 'node-cron';
import { ConfigService } from '../services/configService';
import { DuplicateDetectionService } from '../services/duplicateDetectionService';
import { AttendanceCalculationService } from '../services/attendanceCalculationService';
import { WebhookService } from '../services/webhookService';
import { getPrisma } from '../database/prisma';
import logger from '../utils/logger';

const prisma = getPrisma();

export class AttendanceWorker {
  private static task: cron.ScheduledTask | null = null;

  /**
   * Initializes and starts the background calculation worker.
   */
  static async start() {
    try {
      const cronExpression = await ConfigService.getConfig('calculation_cron') || '0 12 * * *'; // Noon default
      
      logger.info(`[AttendanceWorker] Scheduling background worker with cron: ${cronExpression}`);

      this.task = cron.schedule(cronExpression, async () => {
        logger.info(`[AttendanceWorker] Cron triggered. Sweeping for missing punches and absentees...`);
        
        try {
          // Check for "yesterday" by default to ensure all shifts have ended
          const targetDate = new Date();
          targetDate.setDate(targetDate.getDate() - 1);
          const dateStr = targetDate.toISOString().split('T')[0];
          
          logger.info(`[AttendanceWorker] Target date for sweep: ${dateStr}`);

          // 1. Filter duplicates for safety
          await DuplicateDetectionService.filterDuplicates(dateStr);

          // 2. We NO LONGER run calculateForDate here, as it runs LIVE on every punch!
          // However, we run it once just as a fail-safe fallback for any missed webhooks
          const calculatedCount = await AttendanceCalculationService.calculateForDate(dateStr);

          // 3. Mark absentees (people who had 0 punches)
          const absentCount = await AttendanceCalculationService.markAbsentees(dateStr);

          // 4. Alerting Engine: Find anyone STILL stuck on MISSING_PUNCH for yesterday
          const missingPunchReports = await prisma.dailyAttendanceReport.findMany({
            where: {
              scheduleDate: new Date(`${dateStr}T00:00:00.000Z`),
              status: 'MISSING_PUNCH',
              isManualOverride: false
            }
          });

          if (missingPunchReports.length > 0) {
            logger.warn(`[AttendanceWorker] Found ${missingPunchReports.length} genuine MISSING_PUNCH alerts for ${dateStr}!`);
            
            // Queue a single bulk webhook alert for the main app
            WebhookService.queueWebhook('attendance.alert.missing_punch', {
              date: dateStr,
              count: missingPunchReports.length,
              reports: missingPunchReports.map(r => ({ uid: r.uid, anomalyNotes: r.anomalyNotes }))
            });
          }

          logger.info(`[AttendanceWorker] Sweep complete. Fallback Processed: ${calculatedCount}, Absentees: ${absentCount}, Alerts: ${missingPunchReports.length}`);
        } catch (error) {
          logger.error(`[AttendanceWorker] Error during daily sweep`, { error: (error as Error).message });
        }
      });
      
      this.task.start();
    } catch (error) {
      logger.error(`[AttendanceWorker] Failed to start`, { error: (error as Error).message });
    }
  }

  /**
   * Stops the worker
   */
  static stop() {
    if (this.task) {
      this.task.stop();
      logger.info(`[AttendanceWorker] Worker stopped.`);
    }
  }
}
