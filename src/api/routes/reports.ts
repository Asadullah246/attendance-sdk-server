import { Router, Request, Response, NextFunction } from 'express';
import { getPrisma } from '../../database/prisma';
import { AttendanceCalculationService } from '../../services/attendanceCalculationService';
import { DuplicateDetectionService } from '../../services/duplicateDetectionService';
import { successResponse, errorResponse } from '../../utils/helpers';
import logger from '../../utils/logger';
import { validateRequest } from '../middleware/validate';
import { 
  GetDailyReportsQuerySchema, 
  GetSummaryQuerySchema, 
  CalculateReportsBodySchema, 
  OverrideReportBodySchema, 
  ReportIdParamSchema 
} from '../dtos/report.dto';
import { z } from 'zod';

const prisma = getPrisma();
const router = Router();

const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) => 
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

router.get('/daily', 
  validateRequest(z.object({ query: GetDailyReportsQuerySchema })),
  asyncHandler(async (req: Request, res: Response) => {
    const { date, employeeId, status, dateFrom, dateTo } = req.query;

    const where: any = {};

    if (employeeId) {
      where.employeeId = employeeId;
    }
    
    if (status) {
      where.status = status;
    }

    if (date) {
      where.scheduleDate = new Date(date as string);
    } else if (dateFrom || dateTo) {
      where.scheduleDate = {};
      if (dateFrom) where.scheduleDate.gte = new Date(dateFrom as string);
      if (dateTo) where.scheduleDate.lte = new Date(dateTo as string);
    }

    const reports = await prisma.dailyAttendanceReport.findMany({
      where,
      include: {
        timetable: {
          select: {
            name: true
          }
        }
      },
      orderBy: [{ scheduleDate: 'desc' }, { employeeId: 'asc' }]
    });

    res.json(successResponse(reports, 'Reports fetched successfully'));
  })
);

router.get('/summary', 
  validateRequest(z.object({ query: GetSummaryQuerySchema })),
  asyncHandler(async (req: Request, res: Response) => {
    const { employeeId, dateFrom, dateTo } = req.query;

    const where: any = { employeeId };

    if (dateFrom || dateTo) {
      where.scheduleDate = {};
      if (dateFrom) where.scheduleDate.gte = new Date(dateFrom as string);
      if (dateTo) where.scheduleDate.lte = new Date(dateTo as string);
    }

    const reports = await prisma.dailyAttendanceReport.findMany({ where });

    const summary = {
      employeeId,
      totalDays: reports.length,
      totalPresentDays: 0,
      totalAbsentDays: 0,
      totalLateDays: 0,
      totalEarlyLeaveDays: 0,
      totalMissingPunchDays: 0,
      totalWorkingMinutes: 0,
      totalLateMinutes: 0,
      totalOvertimeMinutes: 0,
      totalManualOvertimeMinutes: 0
    };

    for (const report of reports) {
      if (report.status === 'PRESENT') summary.totalPresentDays++;
      else if (report.status === 'ABSENT') summary.totalAbsentDays++;
      else if (report.status === 'LATE') summary.totalLateDays++;
      else if (report.status === 'EARLY_LEAVE') summary.totalEarlyLeaveDays++;
      else if (report.status === 'MISSING_PUNCH') summary.totalMissingPunchDays++;

      summary.totalWorkingMinutes += report.workingMinutes;
      summary.totalLateMinutes += report.lateMinutes;
      summary.totalOvertimeMinutes += report.overtimeMinutes;
      summary.totalManualOvertimeMinutes += report.manualOvertimeMinutes;
    }

    res.json(successResponse(summary, 'Summary generated successfully'));
  })
);

router.post('/calculate', 
  validateRequest(z.object({ body: CalculateReportsBodySchema })),
  asyncHandler(async (req: Request, res: Response) => {
    const { date } = req.body;

    try {
      await DuplicateDetectionService.filterDuplicates(date);
      const calculatedCount = await AttendanceCalculationService.calculateForDate(date);
      const absentCount = await AttendanceCalculationService.markAbsentees(date);

      res.json(successResponse({ calculatedCount, absentCount }, 'Calculation triggered successfully'));
    } catch (error) {
      logger.error(`[ReportsAPI] Calculation failed`, { error: (error as Error).message });
      res.status(500).json(errorResponse('Calculation failed', 500));
    }
  })
);

router.put('/:id/override', 
  validateRequest(z.object({ params: ReportIdParamSchema, body: OverrideReportBodySchema })),
  asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) {
      return res.status(400).json(errorResponse('Invalid report ID', 400));
    }

    const { status, workingMinutes, overtimeMinutes, manualOvertimeMinutes, manualNote } = req.body;

    const dataToUpdate: any = {
      isManualOverride: true
    };

    if (status !== undefined) dataToUpdate.status = status;
    if (workingMinutes !== undefined) dataToUpdate.workingMinutes = workingMinutes;
    if (overtimeMinutes !== undefined) dataToUpdate.overtimeMinutes = overtimeMinutes;
    if (manualOvertimeMinutes !== undefined) dataToUpdate.manualOvertimeMinutes = manualOvertimeMinutes;
    if (manualNote !== undefined) dataToUpdate.manualNote = manualNote;

    try {
      const updated = await prisma.dailyAttendanceReport.update({
        where: { id },
        data: dataToUpdate
      });

      res.json(successResponse(updated, 'Report overridden successfully'));
    } catch (error) {
      res.status(400).json(errorResponse('Failed to override report. Ensure it exists.', 400));
    }
  })
);

export default router;
