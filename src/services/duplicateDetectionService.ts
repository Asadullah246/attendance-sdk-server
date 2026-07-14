import { getPrisma } from '../database/prisma';
import { ConfigService } from './configService';
import logger from '../utils/logger';

const prisma = getPrisma();

export class DuplicateDetectionService {
  /**
   * Scans raw attendance logs for a given date and marks duplicates.
   * A duplicate is a punch by the same user within the configured threshold minutes.
   */
  static async filterDuplicates(date: string | Date) {
    const targetDate = new Date(date);
    
    // We look at a wider window (e.g., previous day to next day) 
    // because cross-midnight shifts mean punches for "today's" schedule 
    // could happen early tomorrow morning or late yesterday evening.
    const windowStart = new Date(targetDate);
    windowStart.setDate(windowStart.getDate() - 1);
    
    const windowEnd = new Date(targetDate);
    windowEnd.setDate(windowEnd.getDate() + 2); // cover up to 48 hours for extreme night shifts

    const thresholdMinutes = await ConfigService.getConfigNumber('duplicate_threshold_minutes', 3);
    const thresholdMs = thresholdMinutes * 60 * 1000;

    // Fetch all logs in window, ordered chronologically
    const logs = await prisma.attendanceLog.findMany({
      where: {
        punchTime: {
          gte: windowStart,
          lt: windowEnd
        }
      },
      orderBy: { punchTime: 'asc' }
    });

    if (logs.length === 0) return 0;

    // Group logs by UID to process sequentially
    const logsByUid: Record<number, typeof logs> = {};
    for (const log of logs) {
      if (!logsByUid[log.uid]) logsByUid[log.uid] = [];
      logsByUid[log.uid].push(log);
    }

    let duplicateCount = 0;

    for (const uid in logsByUid) {
      const userLogs = logsByUid[uid];
      let lastValidTime = 0;

      for (const log of userLogs) {
        const punchTimeMs = log.punchTime.getTime();
        
        // Is it a duplicate?
        const isDuplicate = lastValidTime !== 0 && (punchTimeMs - lastValidTime) <= thresholdMs;

        if (isDuplicate) {
          // Update only if it wasn't already marked
          if (!log.isDuplicate) {
            await prisma.attendanceLog.update({
              where: { id: log.id },
              data: { isDuplicate: true }
            });
            duplicateCount++;
          }
        } else {
          // It's valid. Make sure it's not marked as duplicate incorrectly
          if (log.isDuplicate) {
            await prisma.attendanceLog.update({
              where: { id: log.id },
              data: { isDuplicate: false }
            });
          }
          lastValidTime = punchTimeMs;
        }
      }
    }

    logger.info(`[DuplicateDetectionService] Processed ${logs.length} logs for ${targetDate.toISOString().split('T')[0]}, found/marked ${duplicateCount} new duplicates.`);
    return duplicateCount;
  }

  /**
   * Reset duplicate flags for a date range
   */
  static async resetDuplicates(dateFrom: Date, dateTo: Date) {
    return prisma.attendanceLog.updateMany({
      where: {
        punchTime: {
          gte: dateFrom,
          lte: dateTo
        }
      },
      data: { isDuplicate: false }
    });
  }
}
