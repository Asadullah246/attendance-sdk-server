import { Router, Request, Response, NextFunction } from 'express';
import { ScheduleService, AssignScheduleInput, BulkAssignInput } from '../../services/scheduleService';
import { successResponse, errorResponse } from '../../utils/helpers';

const router = Router();

const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) => 
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

/**
 * GET /api/v1/schedules
 * List schedules with filters
 */
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const { date, employeeId, dateFrom, dateTo } = req.query;

  const filters = {
    date: date as string,
    employeeId: employeeId as string,
    dateFrom: dateFrom as string,
    dateTo: dateTo as string
  };

  const schedules = await ScheduleService.getSchedules(filters);
  res.json(successResponse(schedules, 'Schedules fetched successfully'));
}));

/**
 * POST /api/v1/schedules
 * Assign a single schedule
 */
router.post('/', asyncHandler(async (req: Request, res: Response) => {
  const data: AssignScheduleInput = req.body;

  try {
    const schedule = await ScheduleService.assignSchedule(data);
    res.json(successResponse(schedule, 'Schedule assigned successfully'));
  } catch (error) {
    res.status(400).json(errorResponse((error as Error).message, 400));
  }
}));

/**
 * POST /api/v1/schedules/bulk
 * Bulk assign schedules
 */
router.post('/bulk', asyncHandler(async (req: Request, res: Response) => {
  const data: BulkAssignInput = req.body;

  try {
    const result = await ScheduleService.bulkAssignSchedule(data);
    res.json(successResponse(result, `Successfully scheduled ${result.count} shifts`));
  } catch (error) {
    res.status(400).json(errorResponse((error as Error).message, 400));
  }
}));

/**
 * DELETE /api/v1/schedules/:id
 * Remove a schedule assignment
 */
router.delete('/:id', asyncHandler(async (req: Request, res: Response) => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) {
    return res.status(400).json(errorResponse('Invalid schedule ID', 400));
  }

  try {
    await ScheduleService.removeSchedule(id);
    res.json(successResponse(null, 'Schedule removed successfully'));
  } catch (error) {
    res.status(400).json(errorResponse((error as Error).message, 400));
  }
}));

export default router;
