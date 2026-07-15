import { getPrisma } from '../database/prisma';
import appConfig from '../config';
import logger from '../utils/logger';
import { WebhookService } from './webhookService';

const prisma = getPrisma();

export class AttendanceCalculationService {
  /**
   * Helper to add minute offsets to a base date.
   */
  private static offsetToAbsoluteTime(scheduleDate: Date, offsetMinutes: number): Date {
    const d = new Date(scheduleDate);
    // Ensure it's at midnight of that date
    d.setHours(0, 0, 0, 0);
    d.setMinutes(d.getMinutes() + offsetMinutes);
    return d;
  }

  // ─── Refactored Helper Methods ───────────────────────────────────────

  /**
   * Validates punches to check for odd pairs, missing breaks, or no punches.
   */
  private static validatePunches(rawLogs: any[], breakMinutes: number) {
    
    let status = 'PRESENT';
    const anomalyNotes: string[] = [];

    if (rawLogs.length === 0) {
      return { status: 'ABSENT', anomalyNotes, actualCheckIn: null, actualCheckOut: null };
    }

    if (rawLogs.length === 2 && breakMinutes > 0) {
      status = 'MISSING_PUNCH';
      anomalyNotes.push(`Only 2 punches found. Missing break punches. Admin review required.`);
    }

    if (rawLogs.length % 2 !== 0) {
      status = 'MISSING_PUNCH';
      anomalyNotes.push(`Odd number of punches (${rawLogs.length}). Admin review required.`);
    }

    const actualCheckIn = rawLogs[0].punchTime;
    
    // Only trust actualCheckOut if there is an even number of punches
    let actualCheckOut = null;
    if (rawLogs.length > 1 && rawLogs.length % 2 === 0) {
      actualCheckOut = rawLogs[rawLogs.length - 1].punchTime;
    }

    return { status, anomalyNotes, actualCheckIn, actualCheckOut };
  }

  /**
   * Calculates total working minutes by pairing up IN and OUT punches.
   */
  private static calculateWorkingMinutes(rawLogs: any[]): number {
    let workingMinutes = 0;
    const pairsCount = Math.floor(rawLogs.length / 2);

    for (let i = 0; i < pairsCount * 2; i += 2) {
      const inPunch = rawLogs[i].punchTime.getTime();
      const outPunch = rawLogs[i+1].punchTime.getTime();
      const durationMins = Math.floor((outPunch - inPunch) / 60000);
      workingMinutes += durationMins;
    }
    
    return workingMinutes;
  }

  /**
   * Calculates late minutes based on grace period.
   */
  private static calculateLateness(actualCheckIn: Date | null, shiftStart: Date, graceMinutes: number) {
    if (!actualCheckIn) return { lateMinutes: 0, isLate: false };

    const lateness = Math.floor((actualCheckIn.getTime() - shiftStart.getTime()) / 60000);
    
    if (lateness > graceMinutes) {
      return { lateMinutes: lateness, isLate: true };
    }
    
    return { lateMinutes: 0, isLate: false };
  }

  /**
   * Calculates overtime and early leave based on shift end time.
   */
  private static calculateOvertimeAndEarlyLeave(actualCheckOut: Date | null, shiftEnd: Date, overtimeThresholdMinutes: number) {
    if (!actualCheckOut) return { earlyLeaveMinutes: 0, overtimeMinutes: 0, isEarlyLeave: false };

    let earlyLeaveMinutes = 0;
    let overtimeMinutes = 0;
    let isEarlyLeave = false;

    const earlyLeave = Math.floor((shiftEnd.getTime() - actualCheckOut.getTime()) / 60000);
    if (earlyLeave > 0) {
      earlyLeaveMinutes = earlyLeave;
      isEarlyLeave = true;
    }

    const rawOvertime = Math.floor((actualCheckOut.getTime() - shiftEnd.getTime()) / 60000);
    if (rawOvertime >= overtimeThresholdMinutes) {
      overtimeMinutes = rawOvertime;
    }

    return { earlyLeaveMinutes, overtimeMinutes, isEarlyLeave };
  }

  /**
   * Calculate hours and identify status for a single schedule.
   * This is a pure function for testing purposes, but here it's integrated with types.
   */
  static calculateForEmployee(
    schedule: any,
    timetable: any,
    rawLogs: any[]
  ) {
    const [year, month, day] = schedule.scheduleDate.toISOString().split('T')[0].split('-');
    const localMidnight = new Date(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10), 0, 0, 0, 0);
    const shiftStart = this.offsetToAbsoluteTime(localMidnight, timetable.shiftStartOffset);
    const shiftEnd = this.offsetToAbsoluteTime(localMidnight, timetable.shiftEndOffset);
    const breakMinutes = timetable.breakMinutes || 0;

    // 1. Validate punches
    const { status: initialStatus, anomalyNotes, actualCheckIn, actualCheckOut } = 
      this.validatePunches(rawLogs, breakMinutes);

    if (initialStatus === 'ABSENT') {
      return {
        actualCheckIn: null, actualCheckOut: null, workingMinutes: 0,
        lateMinutes: 0, earlyLeaveMinutes: 0, overtimeMinutes: 0, breakMinutes: 0,
        middlePunchCount: 0, status: 'ABSENT', anomalyNotes: null
      };
    }

    let currentStatus = initialStatus;

    // 2. Calculate times
    const workingMinutes = this.calculateWorkingMinutes(rawLogs);
    
    // Only calculate late/early/overtime if punches aren't fundamentally broken
    const { lateMinutes, isLate } = currentStatus !== 'MISSING_PUNCH' 
      ? this.calculateLateness(actualCheckIn, shiftStart, timetable.graceMinutes)
      : { lateMinutes: 0, isLate: false };

    const { earlyLeaveMinutes, overtimeMinutes, isEarlyLeave } = currentStatus !== 'MISSING_PUNCH'
      ? this.calculateOvertimeAndEarlyLeave(actualCheckOut, shiftEnd, timetable.overtimeThresholdMinutes)
      : { earlyLeaveMinutes: 0, overtimeMinutes: 0, isEarlyLeave: false };

    // 3. Resolve final status
    if (currentStatus === 'PRESENT') {
      if (isLate) currentStatus = 'LATE';
      else if (isEarlyLeave) currentStatus = 'EARLY_LEAVE';
    }

    return {
      actualCheckIn,
      actualCheckOut,
      workingMinutes,
      lateMinutes,
      earlyLeaveMinutes,
      overtimeMinutes,
      breakMinutes,
      middlePunchCount: rawLogs.length > 2 ? rawLogs.length - 2 : 0,
      status: currentStatus,
      anomalyNotes: anomalyNotes.length > 0 ? anomalyNotes.join('; ') : null
    };
  }

  /**
   * Main entry point to run calculation for a specific employee on a specific date in real-time.
   */
  static async calculateLiveForEmployee(uid: number, dateStr: string) {
    const targetDate = new Date(`${dateStr}T00:00:00.000Z`);

    const schedule = await prisma.employeeSchedule.findUnique({
      where: {
        uid_scheduleDate: {
          uid,
          scheduleDate: targetDate
        }
      },
      include: { timetable: true }
    });

    if (!schedule) return null;

    const logsWindowStart = new Date(targetDate);
    logsWindowStart.setDate(logsWindowStart.getDate() - 1);
    
    const logsWindowEnd = new Date(targetDate);
    logsWindowEnd.setDate(logsWindowEnd.getDate() + 2);

    const rawLogsDb = await prisma.attendanceLog.findMany({
      where: {
        uid,
        isDuplicate: false,
        punchTime: {
          gte: logsWindowStart,
          lte: logsWindowEnd
        }
      },
      orderBy: { punchTime: 'asc' }
    });

    const [sYear, sMonth, sDay] = schedule.scheduleDate.toISOString().split('T')[0].split('-');
    const localMidnight = new Date(parseInt(sYear, 10), parseInt(sMonth, 10) - 1, parseInt(sDay, 10), 0, 0, 0, 0);

    const windowStart = this.offsetToAbsoluteTime(localMidnight, schedule.timetable.checkInStartOffset);
    const windowEnd = this.offsetToAbsoluteTime(localMidnight, schedule.timetable.checkOutEndOffset + 240);

    const rawLogs = rawLogsDb.filter(log => 
      log.punchTime.getTime() >= windowStart.getTime() && 
      log.punchTime.getTime() <= windowEnd.getTime()
    );

    if (rawLogs.length === 0) return null; // Let markAbsentees handle this

    const result = this.calculateForEmployee(schedule, schedule.timetable, rawLogs);

    const existingReport = await prisma.dailyAttendanceReport.findUnique({
      where: {
        uid_scheduleDate: { uid, scheduleDate: targetDate }
      }
    });

    if (existingReport && existingReport.isManualOverride) {
      return null;
    }

    const upsertedReport = await prisma.dailyAttendanceReport.upsert({
      where: {
        uid_scheduleDate: { uid, scheduleDate: targetDate }
      },
      update: {
        timetableId: schedule.timetableId,
        actualCheckIn: result.actualCheckIn,
        actualCheckOut: result.actualCheckOut,
        workingMinutes: result.workingMinutes,
        lateMinutes: result.lateMinutes,
        earlyLeaveMinutes: result.earlyLeaveMinutes,
        overtimeMinutes: result.overtimeMinutes,
        breakMinutes: result.breakMinutes,
        middlePunchCount: result.middlePunchCount,
        status: result.status,
        anomalyNotes: result.anomalyNotes
      },
      create: {
        uid: schedule.uid,
        scheduleDate: schedule.scheduleDate,
        timetableId: schedule.timetableId,
        actualCheckIn: result.actualCheckIn,
        actualCheckOut: result.actualCheckOut,
        workingMinutes: result.workingMinutes,
        lateMinutes: result.lateMinutes,
        earlyLeaveMinutes: result.earlyLeaveMinutes,
        overtimeMinutes: result.overtimeMinutes,
        breakMinutes: result.breakMinutes,
        middlePunchCount: result.middlePunchCount,
        status: result.status,
        anomalyNotes: result.anomalyNotes
      }
    });

    await WebhookService.queueWebhook('attendance.calculated', {
      event: 'attendance.calculated',
      uid: schedule.uid,
      date: dateStr,
      status: result.status,
      workingMinutes: result.workingMinutes,
      lateMinutes: result.lateMinutes,
      overtimeMinutes: result.overtimeMinutes
    });

    return upsertedReport;
  }

  /**
   * Batch entry point to run calculation for a specific date.
   */
  static async calculateForDate(dateStr: string) {
    // Parse as UTC midnight to correctly match DB @db.Date fields
    const targetDate = new Date(`${dateStr}T00:00:00.000Z`);

    logger.info(`[AttendanceCalculationService] Starting calculation for date: ${dateStr}`);

    // Fetch all schedules for the date
    const schedules = await prisma.employeeSchedule.findMany({
      where: { scheduleDate: targetDate },
      include: { timetable: true }
    });

    let processedCount = 0;

    // Bulk-fetch all logs for the window (Day before and day after to safely capture all shifts)
    const logsWindowStart = new Date(targetDate);
    logsWindowStart.setDate(logsWindowStart.getDate() - 1);
    
    const logsWindowEnd = new Date(targetDate);
    logsWindowEnd.setDate(logsWindowEnd.getDate() + 2);

    const allLogs = await prisma.attendanceLog.findMany({
      where: {
        isDuplicate: false,
        punchTime: {
          gte: logsWindowStart,
          lte: logsWindowEnd
        }
      },
      orderBy: { punchTime: 'asc' }
    });

    // Group logs by uid in memory
    const logsByUid: Record<number, any[]> = {};
    for (const log of allLogs) {
      if (!logsByUid[log.uid]) logsByUid[log.uid] = [];
      logsByUid[log.uid].push(log);
    }

    for (const schedule of schedules) {
      try {
        const [sYear, sMonth, sDay] = schedule.scheduleDate.toISOString().split('T')[0].split('-');
        const localMidnight = new Date(parseInt(sYear, 10), parseInt(sMonth, 10) - 1, parseInt(sDay, 10), 0, 0, 0, 0);

        // Build an overall window from checkInStart to checkOutEnd
        const windowStart = this.offsetToAbsoluteTime(localMidnight, schedule.timetable.checkInStartOffset);
        const windowEnd = this.offsetToAbsoluteTime(localMidnight, schedule.timetable.checkOutEndOffset + 240);

        // Filter the grouped logs for the exact window
        const userLogs = logsByUid[schedule.uid] || [];
        const rawLogs = userLogs.filter(log => 
          log.punchTime.getTime() >= windowStart.getTime() && 
          log.punchTime.getTime() <= windowEnd.getTime()
        );

        // Skip if 0 logs - handle in markAbsentees instead
        if (rawLogs.length === 0) continue;

        const result = this.calculateForEmployee(schedule, schedule.timetable, rawLogs);

        // Check if report already exists and is overridden
        const existingReport = await prisma.dailyAttendanceReport.findUnique({
          where: {
            uid_scheduleDate: {
              uid: schedule.uid,
              scheduleDate: schedule.scheduleDate
            }
          }
        });

        if (existingReport && existingReport.isManualOverride) {
          logger.info(`[AttendanceCalculationService] Skipping ${schedule.uid} on ${dateStr} - Manual Override active`);
          continue;
        }

        // Upsert report
        await prisma.dailyAttendanceReport.upsert({
          where: {
            uid_scheduleDate: {
              uid: schedule.uid,
              scheduleDate: schedule.scheduleDate
            }
          },
          update: {
            uid: schedule.uid,
            timetableId: schedule.timetableId,
            actualCheckIn: result.actualCheckIn,
            actualCheckOut: result.actualCheckOut,
            workingMinutes: result.workingMinutes,
            lateMinutes: result.lateMinutes,
            earlyLeaveMinutes: result.earlyLeaveMinutes,
            overtimeMinutes: result.overtimeMinutes,
            breakMinutes: result.breakMinutes,
            middlePunchCount: result.middlePunchCount,
            status: result.status,
            anomalyNotes: result.anomalyNotes
          },
          create: {
            uid: schedule.uid,
            scheduleDate: schedule.scheduleDate,
            timetableId: schedule.timetableId,
            actualCheckIn: result.actualCheckIn,
            actualCheckOut: result.actualCheckOut,
            workingMinutes: result.workingMinutes,
            lateMinutes: result.lateMinutes,
            earlyLeaveMinutes: result.earlyLeaveMinutes,
            overtimeMinutes: result.overtimeMinutes,
            breakMinutes: result.breakMinutes,
            middlePunchCount: result.middlePunchCount,
            status: result.status,
            anomalyNotes: result.anomalyNotes
          }
        });

        // Queue webhook for main app
        await WebhookService.queueWebhook('attendance.calculated', {
          event: 'attendance.calculated',
          uid: schedule.uid,
          date: dateStr,
          status: result.status,
          workingMinutes: result.workingMinutes,
          lateMinutes: result.lateMinutes,
          overtimeMinutes: result.overtimeMinutes
        });

        processedCount++;
      } catch (error) {
        logger.error(`[AttendanceCalculationService] Failed calculation for employee ${schedule.uid}`, { error: (error as Error).message });
      }
    }

    logger.info(`[AttendanceCalculationService] Calculation completed. Processed ${processedCount} records.`);
    return processedCount;
  }

  /**
   * Identifies employees who were scheduled but had no punches, and marks them ABSENT.
   */
  static async markAbsentees(dateStr: string) {
    // Parse as UTC midnight to correctly match DB @db.Date fields
    const targetDate = new Date(`${dateStr}T00:00:00.000Z`);

    // Fetch schedules
    const schedules = await prisma.employeeSchedule.findMany({
      where: { scheduleDate: targetDate }
    });

    let markedCount = 0;

    for (const schedule of schedules) {
      // Find if they have a report (created by calculateForDate)
      const existingReport = await prisma.dailyAttendanceReport.findUnique({
        where: {
          uid_scheduleDate: {
            uid: schedule.uid,
            scheduleDate: schedule.scheduleDate
          }
        }
      });

      // If no report exists, they had no logs and were skipped in calculateForDate
      if (!existingReport) {
        await prisma.dailyAttendanceReport.create({
          data: {
            uid: schedule.uid,
            scheduleDate: schedule.scheduleDate,
            timetableId: schedule.timetableId,
            status: 'ABSENT'
          }
        });

        // Queue webhook for main app
        await WebhookService.queueWebhook('attendance.calculated', {
          event: 'attendance.calculated',
          uid: schedule.uid,
          date: dateStr,
          status: 'ABSENT',
          workingMinutes: 0,
          lateMinutes: 0,
          overtimeMinutes: 0
        });

        markedCount++;
      }
    }

    logger.info(`[AttendanceCalculationService] Marked ${markedCount} employees as ABSENT for ${dateStr}.`);
    return markedCount;
  }
}
