import { getPrisma } from '../database/prisma';

const prisma = getPrisma();

export interface CreateHolidayInput {
  type?: string;
  name: string;
  startDate: string;
  endDate: string;
  description?: string;
}

export class HolidayService {
  static async getHolidays() {
    return prisma.holiday.findMany({
      orderBy: { startDate: 'asc' }
    });
  }

  static async getHolidaysInRange(startDate: Date, endDate: Date) {
    return prisma.holiday.findMany({
      where: {
        OR: [
          {
            startDate: { lte: endDate },
            endDate: { gte: startDate }
          }
        ]
      }
    });
  }

  static async createHoliday(data: CreateHolidayInput) {
    return prisma.holiday.create({
      data: {
        type: data.type || 'global',
        name: data.name,
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
        description: data.description
      }
    });
  }

  static async deleteHoliday(id: number) {
    return prisma.holiday.delete({
      where: { id }
    });
  }
}
