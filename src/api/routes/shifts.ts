import { Router, Request, Response, NextFunction } from 'express';
import { ShiftService, CreateShiftInput } from '../../services/shiftService';
import { successResponse, errorResponse } from '../../utils/helpers';
import { validateRequest } from '../middleware/validate';
import { ShiftIdParamSchema, CreateShiftBodySchema, UpdateShiftBodySchema } from '../dtos/shift.dto';
import { z } from 'zod';

import { timeStringToMinutes, minutesToTimeString } from '../../utils/helpers';

const router = Router();

// Helper to convert shift times from API request to offset integers
function mapShiftBody(body: any): CreateShiftInput {
  const data: any = {
    name: body.name,
    graceMinutes: body.graceMinutes,
    overtimeThresholdMinutes: body.overtimeThresholdMinutes,
    breakMinutes: body.breakMinutes
  };

  if (body.shiftStartTime) data.shiftStartOffset = timeStringToMinutes(body.shiftStartTime);
  if (body.shiftEndTime) data.shiftEndOffset = timeStringToMinutes(body.shiftEndTime);
  if (body.checkInStartTime) data.checkInStartOffset = timeStringToMinutes(body.checkInStartTime);
  if (body.checkInEndTime) data.checkInEndOffset = timeStringToMinutes(body.checkInEndTime);
  if (body.checkOutStartTime) data.checkOutStartOffset = timeStringToMinutes(body.checkOutStartTime);
  if (body.checkOutEndTime) data.checkOutEndOffset = timeStringToMinutes(body.checkOutEndTime);
  if (body.isActive !== undefined) data.isActive = body.isActive;

  // Auto-adjust next-day times if they appear earlier than the shift start
  const baseStart = data.shiftStartOffset;
  if (baseStart !== undefined) {
    if (data.shiftEndOffset !== undefined && data.shiftEndOffset < baseStart) data.shiftEndOffset += 1440;
    if (data.checkInStartOffset !== undefined && data.checkInStartOffset < baseStart - (6 * 60)) data.checkInStartOffset += 1440;
    if (data.checkInEndOffset !== undefined && data.checkInEndOffset < baseStart) data.checkInEndOffset += 1440;
    if (data.checkOutStartOffset !== undefined && data.checkOutStartOffset < baseStart) data.checkOutStartOffset += 1440;
    if (data.checkOutEndOffset !== undefined && data.checkOutEndOffset < baseStart) data.checkOutEndOffset += 1440;
  }

  return data;
}

// Helper to convert database shift to API response
export function mapShiftResponse(shift: any) {
  if (!shift) return null;
  
  return {
    id: shift.id,
    name: shift.name,
    shiftStartTime: minutesToTimeString(shift.shiftStartOffset),
    shiftEndTime: minutesToTimeString(shift.shiftEndOffset),
    checkInStartTime: minutesToTimeString(shift.checkInStartOffset),
    checkInEndTime: minutesToTimeString(shift.checkInEndOffset),
    checkOutStartTime: minutesToTimeString(shift.checkOutStartOffset),
    checkOutEndTime: minutesToTimeString(shift.checkOutEndOffset),
    graceMinutes: shift.graceMinutes,
    overtimeThresholdMinutes: shift.overtimeThresholdMinutes,
    breakMinutes: shift.breakMinutes,
    isActive: shift.isActive,
    createdAt: shift.createdAt,
    updatedAt: shift.updatedAt
  };
}

const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) => 
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

router.get('/', asyncHandler(async (_req: Request, res: Response) => {
  const shifts = await ShiftService.getAllShifts();
  res.json(successResponse(shifts.map(mapShiftResponse), 'Shifts fetched successfully'));
}));

router.get('/:id', 
  validateRequest(z.object({ params: ShiftIdParamSchema })),
  asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) {
      return res.status(400).json(errorResponse('Invalid shift ID', 400));
    }

    const shift = await ShiftService.getShift(id);
    if (!shift) {
      return res.status(404).json(errorResponse('Shift not found', 404));
    }

    res.json(successResponse(mapShiftResponse(shift), 'Shift fetched successfully'));
  })
);

router.post('/', 
  validateRequest(z.object({ body: CreateShiftBodySchema })),
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const data = mapShiftBody(req.body);
      const shift = await ShiftService.createShift(data);
      res.json(successResponse(mapShiftResponse(shift), 'Shift created successfully'));
    } catch (error) {
      res.status(400).json(errorResponse((error as Error).message, 400));
    }
  })
);

router.put('/:id', 
  validateRequest(z.object({ params: ShiftIdParamSchema, body: UpdateShiftBodySchema })),
  asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) {
      return res.status(400).json(errorResponse('Invalid shift ID', 400));
    }

    try {
      const data = mapShiftBody(req.body) as Partial<CreateShiftInput>;
      const shift = await ShiftService.updateShift(id, data);
      res.json(successResponse(mapShiftResponse(shift), 'Shift updated successfully'));
    } catch (error) {
      res.status(400).json(errorResponse((error as Error).message, 400));
    }
  })
);

router.delete('/:id', 
  validateRequest(z.object({ params: ShiftIdParamSchema })),
  asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) {
      return res.status(400).json(errorResponse('Invalid shift ID', 400));
    }

    try {
      await ShiftService.deleteShift(id);
      res.json(successResponse(null, 'Shift deleted successfully'));
    } catch (error) {
      res.status(400).json(errorResponse((error as Error).message, 400));
    }
  })
);

export default router;
