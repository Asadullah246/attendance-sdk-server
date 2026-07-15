import { Router, Request, Response, NextFunction } from 'express';
import { getPrisma } from '../../database/prisma';
import { successResponse } from '../../utils/helpers';
import { validateRequest } from '../middleware/validate';
import { GetAttendanceQuerySchema, CreateAttendanceBodySchema } from '../dtos/attendance.dto';
import { WebhookService } from '../../services/webhookService';
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
    const { sn, uid, dateFrom, dateTo, excludeDuplicates, order = 'desc', page = '1', limit = '100' } = req.query;
    
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

    const hasPaginationParams = req.query.page !== undefined || req.query.limit !== undefined;

    const pageNum = Math.max(1, parseInt((page as string) || '1', 10));
    const limitNum = Math.max(1, parseInt((limit as string) || '100', 10));
    const skip = (pageNum - 1) * limitNum;
    
    // Sort direction
    const sortOrder = (order === 'asc') ? 'asc' : 'desc';

    if (hasPaginationParams) {
      const [total, logs] = await Promise.all([
        prisma.attendanceLog.count({ where: whereClause }),
        prisma.attendanceLog.findMany({
          where: whereClause,
          orderBy: { punchTime: sortOrder },
          skip,
          take: limitNum,
        })
      ]);

      res.json(successResponse({
        data: logs,
        meta: {
          total,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(total / limitNum)
        }
      }, 'Attendance logs fetched successfully'));
    } else {
      // Backward compatibility: flat array
      const logs = await prisma.attendanceLog.findMany({
        where: whereClause,
        orderBy: { punchTime: sortOrder },
        take: 100,
      });

      res.json(successResponse(logs, 'Attendance logs fetched successfully'));
    }
  })
);

router.post('/',
  validateRequest(z.object({ body: CreateAttendanceBodySchema })),
  asyncHandler(async (req: Request, res: Response) => {
    const { deviceSn, uid, punchTime, status, verifyType } = req.body;
    
    const punchTimeDate = new Date(punchTime);

    const log = await prisma.attendanceLog.create({
      data: {
        deviceSn: deviceSn || 'MANUAL',
        uid: uid,
        punchTime: punchTimeDate,
        status: status ?? 0,
        verifyType: verifyType ?? 1,
        source: 'manual',
        rawData: 'Manual Entry',
      }
    });

    // Trigger webhook so the main app syncs the manual punch
    WebhookService.queueWebhook('attendance', log);

    res.json(successResponse(log, 'Manual attendance log created successfully'));
  })
);

export default router;
