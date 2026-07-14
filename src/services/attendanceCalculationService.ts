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

  /**
   * Calculate hours and identify status for a single schedule.
   * This is a pure function for testing purposes, but here it's integrated with types.
   */
  static calculateForEmployee(
    schedule: any,
    timetable: any,
    rawLogs: any[]
  ) {
    const sDate = new Date(schedule.scheduleDate);

    // Build absolute windows
    const checkInStart = this.offsetToAbsoluteTime(sDate, timetable.checkInStartOffset);
    const checkInEnd = this.offsetToAbsoluteTime(sDate, timetable.checkInEndOffset);
    const checkOutStart = this.offsetToAbsoluteTime(sDate, timetable.checkOutStartOffset);
    const checkOutEnd = this.offsetToAbsoluteTime(sDate, timetable.checkOutEndOffset);
    const shiftStart = this.offsetToAbsoluteTime(sDate, timetable.shiftStartOffset);
    const shiftEnd = this.offsetToAbsoluteTime(sDate, timetable.shiftEndOffset);

    // Classify punches
    const checkInCandidates = [];
    const checkOutCandidates = [];
    const middlePunches = [];
    const outsidePunches = [];

    for (const log of rawLogs) {
      const pTime = log.punchTime.getTime();
      if (pTime >= checkInStart.getTime() && pTime <= checkInEnd.getTime()) {
        checkInCandidates.push(log);
      } else if (pTime >= checkOutStart.getTime() && pTime <= checkOutEnd.getTime()) {
        checkOutCandidates.push(log);
      } else if (pTime > checkInEnd.getTime() && pTime < checkOutStart.getTime()) {
        middlePunches.push(log);
      } else {
        outsidePunches.push(log);
      }
    }

    // Select actual punches
    const actualCheckIn = checkInCandidates.length > 0 ? checkInCandidates[0].punchTime : null;
    const actualCheckOut = checkOutCandidates.length > 0 ? checkOutCandidates[checkOutCandidates.length - 1].punchTime : null;

    let status = 'PRESENT';
    let anomalyNotes = [];
    let workingMinutes = 0;
    let lateMinutes = 0;
    let earlyLeaveMinutes = 0;
    let overtimeMinutes = 0;
    const breakMinutes = timetable.breakMinutes || 0;

    // Detect anomalies
    if (!actualCheckIn && !actualCheckOut) {
      if (rawLogs.length > 0) {
        status = 'EXCEPTION';
        anomalyNotes.push('Punches exist but outside all valid windows');
      }
    } else if (actualCheckIn && !actualCheckOut) {
      status = 'MISSING_PUNCH';
      anomalyNotes.push('Missing check-out punch within window');
    } else if (!actualCheckIn && actualCheckOut) {
      status = 'MISSING_PUNCH';
      anomalyNotes.push('Missing check-in punch within window');
    }

    // Odd middle punch check
    if (middlePunches.length % 2 !== 0) {
      status = 'MISSING_PUNCH';
      anomalyNotes.push(`Odd middle punch count (${middlePunches.length}) - missing paired punch`);
    }

    // Calculate time if both check-in and check-out exist
    if (actualCheckIn && actualCheckOut) {
      const grossMinutes = Math.floor((actualCheckOut.getTime() - actualCheckIn.getTime()) / 60000);
      workingMinutes = Math.max(0, grossMinutes - breakMinutes);

      const lateness = Math.floor((actualCheckIn.getTime() - shiftStart.getTime()) / 60000);
      if (lateness > timetable.graceMinutes) {
        lateMinutes = lateness;
        if (status === 'PRESENT') status = 'LATE';
      }

      const earlyLeave = Math.floor((shiftEnd.getTime() - actualCheckOut.getTime()) / 60000);
      if (earlyLeave > 0) {
        earlyLeaveMinutes = earlyLeave;
        if (status === 'PRESENT') status = 'EARLY_LEAVE';
      }

      const rawOvertime = Math.floor((actualCheckOut.getTime() - shiftEnd.getTime()) / 60000);
      if (rawOvertime >= timetable.overtimeThresholdMinutes) {
        overtimeMinutes = rawOvertime;
      }
    }

    return {
      actualCheckIn,
      actualCheckOut,
      workingMinutes,
      lateMinutes,
      earlyLeaveMinutes,
      overtimeMinutes,
      breakMinutes,
      middlePunchCount: middlePunches.length,
      status,
      anomalyNotes: anomalyNotes.length > 0 ? anomalyNotes.join('; ') : null
    };
  }

  /**
   * Main entry point to run calculation for a specific date.
   */
  static async calculateForDate(dateStr: string) {
    const targetDate = new Date(dateStr);
    targetDate.setHours(0, 0, 0, 0);

    logger.info(`[AttendanceCalculationService] Starting calculation for date: ${dateStr}`);

    // Fetch all schedules for the date
    const schedules = await prisma.employeeSchedule.findMany({
      where: { scheduleDate: targetDate },
      include: { timetable: true }
    });

    let processedCount = 0;

    for (const schedule of schedules) {
      try {
        const sDate = new Date(schedule.scheduleDate);
        // Build an overall window from checkInStart to checkOutEnd for DB query
        const windowStart = this.offsetToAbsoluteTime(sDate, schedule.timetable.checkInStartOffset);
        // We add some buffer to the checkOutEnd to capture outside punches as well
        const windowEnd = this.offsetToAbsoluteTime(sDate, schedule.timetable.checkOutEndOffset + 1440); // +24 hours for safety

        // Fetch raw logs
        const rawLogs = await prisma.attendanceLog.findMany({
          where: {
            uid: schedule.employeeDeviceUid,
            isDuplicate: false, // exclude duplicates
            punchTime: {
              gte: windowStart,
              lte: windowEnd
            }
          },
          orderBy: { punchTime: 'asc' }
        });

        // Skip if 0 logs - handle in markAbsentees instead
        if (rawLogs.length === 0) continue;

        const result = this.calculateForEmployee(schedule, schedule.timetable, rawLogs);

        // Check if report already exists and is overridden
        const existingReport = await prisma.dailyAttendanceReport.findUnique({
          where: {
            employeeId_scheduleDate: {
              employeeId: schedule.employeeId,
              scheduleDate: schedule.scheduleDate
            }
          }
        });

        if (existingReport && existingReport.isManualOverride) {
          logger.info(`[AttendanceCalculationService] Skipping ${schedule.employeeId} on ${dateStr} - Manual Override active`);
          continue;
        }

        // Upsert report
        await prisma.dailyAttendanceReport.upsert({
          where: {
            employeeId_scheduleDate: {
              employeeId: schedule.employeeId,
              scheduleDate: schedule.scheduleDate
            }
          },
          update: {
            employeeDeviceUid: schedule.employeeDeviceUid,
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
            employeeId: schedule.employeeId,
            employeeDeviceUid: schedule.employeeDeviceUid,
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
          employeeId: schedule.employeeId,
          date: dateStr,
          status: result.status,
          workingMinutes: result.workingMinutes,
          lateMinutes: result.lateMinutes,
          overtimeMinutes: result.overtimeMinutes
        });

        processedCount++;
      } catch (error) {
        logger.error(`[AttendanceCalculationService] Failed calculation for employee ${schedule.employeeId}`, { error: (error as Error).message });
      }
    }

    logger.info(`[AttendanceCalculationService] Calculation completed. Processed ${processedCount} records.`);
    return processedCount;
  }

  /**
   * Identifies employees who were scheduled but had no punches, and marks them ABSENT.
   */
  static async markAbsentees(dateStr: string) {
    const targetDate = new Date(dateStr);
    targetDate.setHours(0, 0, 0, 0);

    // Fetch schedules
    const schedules = await prisma.employeeSchedule.findMany({
      where: { scheduleDate: targetDate }
    });

    let markedCount = 0;

    for (const schedule of schedules) {
      // Find if they have a report (created by calculateForDate)
      const existingReport = await prisma.dailyAttendanceReport.findUnique({
        where: {
          employeeId_scheduleDate: {
            employeeId: schedule.employeeId,
            scheduleDate: schedule.scheduleDate
          }
        }
      });

      // If no report exists, they had no logs and were skipped in calculateForDate
      if (!existingReport) {
        await prisma.dailyAttendanceReport.create({
          data: {
            employeeId: schedule.employeeId,
            employeeDeviceUid: schedule.employeeDeviceUid,
            scheduleDate: schedule.scheduleDate,
            timetableId: schedule.timetableId,
            status: 'ABSENT'
          }
        });

        // Queue webhook for main app
        await WebhookService.queueWebhook('attendance.calculated', {
          event: 'attendance.calculated',
          employeeId: schedule.employeeId,
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
