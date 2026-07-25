import { getPrisma } from '../database/prisma';
import logger from '../utils/logger';

const prisma = getPrisma();

export interface AssignScheduleInput {
  uid: number;
  timetableId: number;
  scheduleDate: string; // ISO format date 'YYYY-MM-DD'
}

export interface BulkAssignInput {
  uids?: (number | string)[];
  timetableId?: number | string;
  dateFrom?: string;
  dateTo?: string;
  schedules?: {
    uid: number;
    timetableId: number;
    scheduleDate: string; // ISO format date 'YYYY-MM-DD'
  }[];
}

export class ScheduleService {
  /**
   * Assign a single schedule to an employee
   */
  static async assignSchedule(data: AssignScheduleInput) {
    const targetDate = new Date(data.scheduleDate);

    // Check conflict
    const existing = await prisma.employeeSchedule.findFirst({
      where: {
        uid: data.uid,
        scheduleDate: targetDate
      }
    });

    if (existing) {
      throw new Error(`Employee already scheduled on ${data.scheduleDate}`);
    }

    return prisma.employeeSchedule.create({
      data: {
        uid: data.uid,
        timetableId: data.timetableId,
        scheduleDate: targetDate
      }
    });
  }

  /**
   * Bulk assign schedules to multiple employees over a date range or explicit schedule list
   */
  static async bulkAssignSchedule(data: BulkAssignInput) {
    let createdCount = 0;

    // Case 1: Date Range bulk assignment ({ uids, timetableId, dateFrom, dateTo })
    if (data.uids && Array.isArray(data.uids) && data.timetableId && data.dateFrom && data.dateTo) {
      const startDate = new Date(`${data.dateFrom}T00:00:00.000Z`);
      const endDate = new Date(`${data.dateTo}T00:00:00.000Z`);

      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        throw new Error('Invalid dateFrom or dateTo format');
      }

      const timetableIdNum = typeof data.timetableId === 'number' ? data.timetableId : parseInt(String(data.timetableId), 10);

      const recordsToUpsert: { uid: number; timetableId: number; scheduleDate: Date }[] = [];

      let curr = new Date(startDate);
      while (curr <= endDate) {
        const scheduleDate = new Date(curr);
        for (const rawUid of data.uids) {
          const uid = typeof rawUid === 'number' ? rawUid : parseInt(String(rawUid), 10);
          if (!isNaN(uid)) {
            recordsToUpsert.push({
              uid,
              timetableId: timetableIdNum,
              scheduleDate,
            });
          }
        }
        curr.setDate(curr.getDate() + 1);
      }

      for (const rec of recordsToUpsert) {
        try {
          await prisma.employeeSchedule.upsert({
            where: {
              uid_scheduleDate: {
                uid: rec.uid,
                scheduleDate: rec.scheduleDate,
              },
            },
            update: {
              timetableId: rec.timetableId,
            },
            create: {
              uid: rec.uid,
              timetableId: rec.timetableId,
              scheduleDate: rec.scheduleDate,
            },
          });
          createdCount++;
        } catch (error) {
          logger.warn(`[ScheduleService] Failed to assign bulk schedule for ${rec.uid} on ${rec.scheduleDate}`);
        }
      }

      return { count: createdCount };
    }

    // Case 2: Explicit schedules array ({ schedules: [...] })
    if (data.schedules && Array.isArray(data.schedules)) {
      for (const item of data.schedules) {
        try {
          const targetDate = new Date(`${item.scheduleDate}T00:00:00.000Z`);
          
          await prisma.employeeSchedule.upsert({
            where: {
              uid_scheduleDate: {
                uid: item.uid,
                scheduleDate: targetDate
              }
            },
            update: {
              timetableId: item.timetableId
            },
            create: {
              uid: item.uid,
              timetableId: item.timetableId,
              scheduleDate: targetDate
            }
          });
          createdCount++;
        } catch (error) {
          logger.warn(`[ScheduleService] Failed to assign bulk schedule for ${item.uid} on ${item.scheduleDate}`);
        }
      }
    }

    return { count: createdCount };
  }

  /**
   * Remove a schedule assignment
   */
  static async removeSchedule(id: number) {
    return prisma.employeeSchedule.delete({
      where: { id }
    });
  }

  /**
   * Fetch schedules based on filters
   */
  static async getSchedules(filters: { date?: string; uid?: number; dateFrom?: string; dateTo?: string }) {
    const where: any = {};

    if (filters.uid) {
      where.uid = filters.uid;
    }

    if (filters.date) {
      where.scheduleDate = new Date(filters.date);
    } else if (filters.dateFrom || filters.dateTo) {
      where.scheduleDate = {};
      if (filters.dateFrom) where.scheduleDate.gte = new Date(filters.dateFrom);
      if (filters.dateTo) where.scheduleDate.lte = new Date(filters.dateTo);
    }

    return prisma.employeeSchedule.findMany({
      where,
      include: { timetable: true },
      orderBy: { scheduleDate: 'asc' }
    });
  }
}
