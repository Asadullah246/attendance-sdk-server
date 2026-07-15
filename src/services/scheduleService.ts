import { getPrisma } from '../database/prisma';
import logger from '../utils/logger';

const prisma = getPrisma();

export interface AssignScheduleInput {
  uid: number;
  timetableId: number;
  scheduleDate: string; // ISO format date 'YYYY-MM-DD'
}

export interface BulkAssignInput {
  schedules: {
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
   * Bulk assign schedules to multiple employees over a date range
   */
  static async bulkAssignSchedule(data: BulkAssignInput) {
    let createdCount = 0;

    for (const item of data.schedules) {
      try {
        const targetDate = new Date(item.scheduleDate);
        
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
