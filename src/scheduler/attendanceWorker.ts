import * as cron from 'node-cron';
import { ConfigService } from '../services/configService';
import { DuplicateDetectionService } from '../services/duplicateDetectionService';
import { AttendanceCalculationService } from '../services/attendanceCalculationService';
import logger from '../utils/logger';

export class AttendanceWorker {
  private static task: cron.ScheduledTask | null = null;

  /**
   * Initializes and starts the background calculation worker.
   */
  static async start() {
    try {
      const cronExpression = await ConfigService.getConfig('calculation_cron') || '0 2 * * *';
      
      logger.info(`[AttendanceWorker] Scheduling background worker with cron: ${cronExpression}`);

      this.task = cron.schedule(cronExpression, async () => {
        logger.info(`[AttendanceWorker] Cron triggered. Starting daily calculation...`);
        
        try {
          // Calculate for "yesterday" by default to ensure all shifts have ended
          const targetDate = new Date();
          targetDate.setDate(targetDate.getDate() - 1);
          const dateStr = targetDate.toISOString().split('T')[0];
          
          logger.info(`[AttendanceWorker] Target date for calculation: ${dateStr}`);

          // 1. Filter duplicates
          await DuplicateDetectionService.filterDuplicates(dateStr);

          // 2. Run core calculation engine
          const calculatedCount = await AttendanceCalculationService.calculateForDate(dateStr);

          // 3. Mark absentees
          const absentCount = await AttendanceCalculationService.markAbsentees(dateStr);

          logger.info(`[AttendanceWorker] Daily calculation complete. Processed: ${calculatedCount}, Absentees marked: ${absentCount}`);
        } catch (error) {
          logger.error(`[AttendanceWorker] Error during daily calculation`, { error: (error as Error).message });
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
