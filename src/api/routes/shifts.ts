import { Router, Request, Response, NextFunction } from 'express';
import { ShiftService, CreateShiftInput } from '../../services/shiftService';
import { successResponse, errorResponse } from '../../utils/helpers';

const router = Router();

const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) => 
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

/**
 * GET /api/v1/shifts
 * List all active shift timetables
 */
router.get('/', asyncHandler(async (_req: Request, res: Response) => {
  const shifts = await ShiftService.getAllShifts();
  res.json(successResponse(shifts, 'Shifts fetched successfully'));
}));

/**
 * GET /api/v1/shifts/:id
 * Get single shift with human-readable times
 */
router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) {
    return res.status(400).json(errorResponse('Invalid shift ID', 400));
  }

  const shift = await ShiftService.getShift(id);
  if (!shift) {
    return res.status(404).json(errorResponse('Shift not found', 404));
  }

  res.json(successResponse(shift, 'Shift fetched successfully'));
}));

/**
 * POST /api/v1/shifts
 * Create a new shift timetable
 */
router.post('/', asyncHandler(async (req: Request, res: Response) => {
  const data: CreateShiftInput = req.body;

  try {
    const shift = await ShiftService.createShift(data);
    res.json(successResponse(shift, 'Shift created successfully'));
  } catch (error) {
    res.status(400).json(errorResponse((error as Error).message, 400));
  }
}));

/**
 * PUT /api/v1/shifts/:id
 * Update a shift timetable
 */
router.put('/:id', asyncHandler(async (req: Request, res: Response) => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) {
    return res.status(400).json(errorResponse('Invalid shift ID', 400));
  }

  const data: Partial<CreateShiftInput> = req.body;

  try {
    const shift = await ShiftService.updateShift(id, data);
    res.json(successResponse(shift, 'Shift updated successfully'));
  } catch (error) {
    res.status(400).json(errorResponse((error as Error).message, 400));
  }
}));

/**
 * DELETE /api/v1/shifts/:id
 * Soft delete a shift timetable
 */
router.delete('/:id', asyncHandler(async (req: Request, res: Response) => {
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
}));

export default router;
