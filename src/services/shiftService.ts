import { getPrisma } from '../database/prisma';
import logger from '../utils/logger';

const prisma = getPrisma();

export interface CreateShiftInput {
  name: string;
  shiftStartOffset: number;
  shiftEndOffset: number;
  checkInStartOffset: number;
  checkInEndOffset: number;
  checkOutStartOffset: number;
  checkOutEndOffset: number;
  graceMinutes?: number;
  overtimeThresholdMinutes?: number;
  breakMinutes?: number;
}

export class ShiftService {
  /**
   * Convert offset in minutes to human readable time string (e.g. 480 -> "08:00 AM")
   */
  static offsetToTimeString(offset: number): string {
    const isNextDay = offset >= 1440;
    const normalizedOffset = offset % 1440;
    const hours = Math.floor(normalizedOffset / 60);
    const minutes = normalizedOffset % 60;
    
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    const displayMinutes = minutes.toString().padStart(2, '0');
    
    let timeStr = `${displayHours.toString().padStart(2, '0')}:${displayMinutes} ${ampm}`;
    if (isNextDay) {
      timeStr += ' (Next Day)';
    }
    return timeStr;
  }

  /**
   * Validates shift offsets
   */
  private static validateOffsets(data: CreateShiftInput) {
    if (data.checkInStartOffset >= data.checkInEndOffset) {
      throw new Error('Check-In start time must be before Check-In end time');
    }
    if (data.checkOutStartOffset >= data.checkOutEndOffset) {
      throw new Error('Check-Out start time must be before Check-Out end time');
    }
    if (data.checkInEndOffset >= data.checkOutStartOffset) {
      throw new Error('Check-In window and Check-Out window cannot overlap');
    }
  }

  /**
   * Create a new shift timetable
   */
  static async createShift(data: CreateShiftInput) {
    this.validateOffsets(data);
    return prisma.shiftTimetable.create({
      data: {
        name: data.name,
        shiftStartOffset: data.shiftStartOffset,
        shiftEndOffset: data.shiftEndOffset,
        checkInStartOffset: data.checkInStartOffset,
        checkInEndOffset: data.checkInEndOffset,
        checkOutStartOffset: data.checkOutStartOffset,
        checkOutEndOffset: data.checkOutEndOffset,
        graceMinutes: data.graceMinutes ?? 15,
        overtimeThresholdMinutes: data.overtimeThresholdMinutes ?? 30,
        breakMinutes: data.breakMinutes ?? 0,
        isActive: true
      }
    });
  }

  /**
   * Update an existing shift timetable
   */
  static async updateShift(id: number, data: Partial<CreateShiftInput>) {
    const existing = await prisma.shiftTimetable.findUnique({ where: { id } });
    if (!existing) {
      throw new Error('Shift not found');
    }

    const mergedData = { ...existing, ...data };
    this.validateOffsets(mergedData as CreateShiftInput);

    return prisma.shiftTimetable.update({
      where: { id },
      data: mergedData
    });
  }

  /**
   * Soft delete a shift timetable
   */
  static async deleteShift(id: number) {
    return prisma.shiftTimetable.update({
      where: { id },
      data: { isActive: false }
    });
  }

  /**
   * Get a single shift with human-readable times
   */
  static async getShift(id: number) {
    const shift = await prisma.shiftTimetable.findUnique({
      where: { id, isActive: true }
    });

    if (!shift) return null;

    return shift;
  }

  /**
   * Get all active shifts
   */
  static async getAllShifts() {
    const shifts = await prisma.shiftTimetable.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' }
    });

    return shifts;
  }
}
