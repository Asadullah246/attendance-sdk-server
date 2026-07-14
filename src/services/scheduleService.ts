import { getPrisma } from '../database/prisma';
import logger from '../utils/logger';

const prisma = getPrisma();

export interface AssignScheduleInput {
  uid: number;
  timetableId: number;
  scheduleDate: string; // ISO format date 'YYYY-MM-DD'
}

export interface BulkAssignInput {
  uids: number[];
  timetableId: number;
  dateFrom: string; // ISO format date 'YYYY-MM-DD'
  dateTo: string;   // ISO format date 'YYYY-MM-DD'
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
    const startDate = new Date(data.dateFrom);
    const endDate = new Date(data.dateTo);

    if (startDate > endDate) {
      throw new Error('dateFrom cannot be after dateTo');
    }

    const recordsToCreate = [];

    // Loop through each date
    let currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      for (let i = 0; i < data.uids.length; i++) {
        recordsToCreate.push({
          uid: data.uids[i],
          timetableId: data.timetableId,
          scheduleDate: new Date(currentDate)
        });
      }
      currentDate.setDate(currentDate.getDate() + 1);
    }

    // Skip duplicates in database, create the rest
    let createdCount = 0;
    for (const record of recordsToCreate) {
      try {
        await prisma.employeeSchedule.upsert({
          where: {
            uid_scheduleDate: {
              uid: record.uid,
              scheduleDate: record.scheduleDate
            }
          },
          update: {
            timetableId: record.timetableId
          },
          create: record
        });
        createdCount++;
      } catch (error) {
        logger.warn(`[ScheduleService] Failed to assign bulk schedule for ${record.uid} on ${record.scheduleDate.toISOString()}`);
      }
    }

    return { success: true, count: createdCount };
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
