import { Router, Request, Response, NextFunction } from 'express';
import { getPrisma } from '../../database/prisma';
import { successResponse } from '../../utils/helpers';
import { validateRequest } from '../middleware/validate';
import { GetAttendanceQuerySchema } from '../dtos/attendance.dto';
import { z } from 'zod';

const router = Router();
const prisma = getPrisma();

const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) => 
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

router.get('/', 
  validateRequest(z.object({ query: GetAttendanceQuerySchema })),
  asyncHandler(async (req: Request, res: Response) => {
    const { sn, uid, dateFrom, dateTo, excludeDuplicates, limit = '100' } = req.query;
    
    const whereClause: any = {};
    
    if (sn && typeof sn === 'string') {
      whereClause.deviceSn = sn;
    }
    
    if (uid) {
      whereClause.uid = parseInt(uid as string, 10);
    }

    if (dateFrom || dateTo) {
      whereClause.punchTime = {};
      if (dateFrom) whereClause.punchTime.gte = new Date(dateFrom as string);
      if (dateTo) whereClause.punchTime.lte = new Date(dateTo as string);
    }

    if (excludeDuplicates === 'true') {
      whereClause.isDuplicate = false;
    }

    const limitNum = parseInt(limit as string, 10);

    const logs = await prisma.attendanceLog.findMany({
      where: whereClause,
      orderBy: { punchTime: 'desc' },
      take: isNaN(limitNum) ? 100 : limitNum,
    });

    res.json(successResponse(logs, 'Attendance logs fetched successfully'));
  })
);

export default router;
