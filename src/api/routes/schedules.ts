import { Router, Request, Response, NextFunction } from 'express';
import { ScheduleService, AssignScheduleInput, BulkAssignInput } from '../../services/scheduleService';
import { successResponse, errorResponse } from '../../utils/helpers';
import { validateRequest } from '../middleware/validate';
import { 
  GetSchedulesQuerySchema, 
  AssignScheduleBodySchema, 
  BulkAssignScheduleBodySchema, 
  ScheduleIdParamSchema 
} from '../dtos/schedule.dto';
import { z } from 'zod';
import { mapShiftResponse } from './shifts';

// Helper to clean schedule response and format timetable
function mapScheduleResponse(schedule: any) {
  if (!schedule) return null;
  return {
    id: schedule.id,
    employeeId: schedule.employeeId,
    employeeDeviceUid: schedule.employeeDeviceUid,
    timetableId: schedule.timetableId,
    scheduleDate: schedule.scheduleDate,
    createdAt: schedule.createdAt,
    updatedAt: schedule.updatedAt,
    timetable: schedule.timetable ? mapShiftResponse(schedule.timetable) : undefined
  };
}

const router = Router();

const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) => 
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

router.get('/', 
  validateRequest(z.object({ query: GetSchedulesQuerySchema })),
  asyncHandler(async (req: Request, res: Response) => {
    const { date, employeeId, dateFrom, dateTo } = req.query;

    const filters = {
      date: date as string,
      employeeId: employeeId as string,
      dateFrom: dateFrom as string,
      dateTo: dateTo as string
    };

    const schedules = await ScheduleService.getSchedules(filters);
    res.json(successResponse(schedules.map(mapScheduleResponse), 'Schedules fetched successfully'));
  })
);

router.post('/', 
  validateRequest(z.object({ body: AssignScheduleBodySchema })),
  asyncHandler(async (req: Request, res: Response) => {
    const data: AssignScheduleInput = req.body;

    try {
      const schedule = await ScheduleService.assignSchedule(data);
      res.json(successResponse(mapScheduleResponse(schedule), 'Schedule assigned successfully'));
    } catch (error) {
      res.status(400).json(errorResponse((error as Error).message, 400));
    }
  })
);

router.post('/bulk', 
  validateRequest(z.object({ body: BulkAssignScheduleBodySchema })),
  asyncHandler(async (req: Request, res: Response) => {
    const data: BulkAssignInput = req.body;

    try {
      const result = await ScheduleService.bulkAssignSchedule(data);
      res.json(successResponse(result, `Successfully scheduled ${result.count} shifts`));
    } catch (error) {
      res.status(400).json(errorResponse((error as Error).message, 400));
    }
  })
);

router.delete('/:id', 
  validateRequest(z.object({ params: ScheduleIdParamSchema })),
  asyncHandler(async (req: Request, res: Response) => {
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
  })
);

export default router;
