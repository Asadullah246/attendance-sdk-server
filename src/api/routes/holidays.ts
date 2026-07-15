import { Router, Request, Response, NextFunction } from 'express';
import { HolidayService } from '../../services/holidayService';
import { successResponse, errorResponse } from '../../utils/helpers';
import { validateRequest } from '../middleware/validate';
import { 
  CreateHolidayBodySchema, 
  HolidayIdParamSchema 
} from '../dtos/holiday.dto';
import { z } from 'zod';

const router = Router();

const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) => 
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

router.get('/', 
  asyncHandler(async (_req: Request, res: Response) => {
    const holidays = await HolidayService.getHolidays();
    res.json(successResponse(holidays, 'Holidays fetched successfully'));
  })
);

router.post('/', 
  validateRequest(z.object({ body: CreateHolidayBodySchema })),
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const result = await HolidayService.createHoliday(req.body);
      res.json(successResponse(result, 'Holiday created successfully'));
    } catch (error) {
      res.status(400).json(errorResponse((error as Error).message, 400));
    }
  })
);

router.delete('/:id', 
  validateRequest(z.object({ params: HolidayIdParamSchema })),
  asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) {
      return res.status(400).json(errorResponse('Invalid holiday ID', 400));
    }

    try {
      await HolidayService.deleteHoliday(id);
      res.json(successResponse(null, 'Holiday deleted successfully'));
    } catch (error) {
      res.status(400).json(errorResponse((error as Error).message, 400));
    }
  })
);

export default router;
