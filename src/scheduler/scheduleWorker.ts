import cron from 'node-cron';
import { getPrisma } from '../database/prisma';
import logger from '../utils/logger';

const prisma = getPrisma();

export class ScheduleWorker {
  /**
   * Initializes and starts the background cron job
   */
  static start() {
    // Run every day at 01:00 AM
    cron.schedule('0 1 * * *', async () => {
      logger.info('[ScheduleWorker] Starting daily auto-scheduling job...');
      await this.runAutoSchedule();
    });

    logger.info('[ScheduleWorker] Auto-scheduling cron job initialized (Runs daily at 01:00 AM)');
  }

  /**
   * Core logic for generating 30-day schedules based on defaultTimetableId
   */
  static async runAutoSchedule() {
    try {
      await this.cleanupStaleCommands();

      // 1. Get all active users with a default shift
      const users = await prisma.user.findMany({
        where: {
          status: 'active',
          defaultTimetableId: { not: null }
        },
        select: {
          uid: true,
          defaultTimetableId: true
        }
      });

      if (users.length === 0) {
        logger.info('[ScheduleWorker] No active users with defaultTimetableId found. Skipping.');
        return;
      }

      // 2. Prepare the date window (Next 30 days starting today)
      const startDate = new Date();
      startDate.setHours(0, 0, 0, 0);

      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 30);

      const recordsToCreate: { uid: number; timetableId: number; scheduleDate: Date }[] = [];

      // Generate the daily records in memory
      let currentDate = new Date(startDate);
      while (currentDate <= endDate) {
        for (const user of users) {
          recordsToCreate.push({
            uid: user.uid,
            timetableId: user.defaultTimetableId as number,
            scheduleDate: new Date(currentDate)
          });
        }
        currentDate.setDate(currentDate.getDate() + 1);
      }

      // 3. Bulk Insert with skipDuplicates to avoid overwriting manual admin schedules
      const result = await prisma.employeeSchedule.createMany({
        data: recordsToCreate,
        skipDuplicates: true
      });

      logger.info(`[ScheduleWorker] Auto-scheduling completed. Created ${result.count} new shift assignments.`);
    } catch (error) {
      logger.error('[ScheduleWorker] Error during auto-scheduling:', error);
    }
  }

  /**
   * Cleans up pending/failed commands older than 30 days to prevent DB bloat
   * when devices go offline permanently.
   */
  private static async cleanupStaleCommands() {
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const result = await prisma.commandQueue.deleteMany({
        where: {
          createdAt: { lt: thirtyDaysAgo },
          status: { in: ['pending', 'failed'] }
        }
      });

      if (result.count > 0) {
        logger.info(`[ScheduleWorker] Cleaned up ${result.count} stale/failed commands older than 30 days.`);
      }
    } catch (error) {
      logger.error('[ScheduleWorker] Error during command cleanup:', error);
    }
  }
}
