import { Router, Request, Response, NextFunction } from 'express';
import { getPrisma } from '../../database/prisma';
import { successResponse } from '../../utils/helpers';
import { validateRequest } from '../middleware/validate';
import { GetAttendanceQuerySchema, CreateAttendanceBodySchema } from '../dtos/attendance.dto';
import { WebhookService } from '../../services/webhookService';
import { AttendanceCalculationService } from '../../services/attendanceCalculationService';
import logger from '../../utils/logger';
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
    
    const numericUid = typeof uid === 'number' ? uid : parseInt(String(uid), 10);
    const numericStatus = status !== undefined && status !== null ? Number(status) : 0;
    const numericVerifyType = verifyType !== undefined && verifyType !== null ? Number(verifyType) : 1;

    const punchTimeDate = new Date(punchTime);
    if (isNaN(punchTimeDate.getTime())) {
      return res.status(400).json({ success: false, message: 'Invalid punchTime date format' });
    }

    const log = await prisma.attendanceLog.create({
      data: {
        deviceSn: deviceSn || 'MANUAL',
        uid: numericUid,
        punchTime: punchTimeDate,
        status: numericStatus,
        verifyType: numericVerifyType,
        source: 'manual',
        rawData: 'Manual Entry',
      }
    });

    // 1. Queue webhooks (both raw_attendance and attendance for compatibility)
    await WebhookService.queueWebhook('raw_attendance', log);
    logger.info(`[WebhookService] Queued webhook raw_attendance for UID: ${numericUid}`);
    await WebhookService.queueWebhook('attendance', log);
    logger.info(`[WebhookService] Queued webhook attendance for UID: ${numericUid}`);

    // 2. --- LIVE CALCULATION ---
    const todayStr = punchTimeDate.toISOString().split('T')[0];
    const yesterdayDate = new Date(punchTimeDate);
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterdayStr = yesterdayDate.toISOString().split('T')[0];

    try {
      await AttendanceCalculationService.calculateLiveForEmployee(numericUid, todayStr);
      await AttendanceCalculationService.calculateLiveForEmployee(numericUid, yesterdayStr);
    } catch (e) {
      logger.error(`[LiveCalc] Error for ${numericUid} on ${todayStr}`, { error: (e as Error).message });
    }

    // 3. Immediately attempt background webhook delivery to Main App
    WebhookService.processWebhooks().catch((e) =>
      logger.error(`[Webhook] Immediate delivery error`, { error: (e as Error).message })
    );

    res.json(successResponse(log, 'Manual attendance log created successfully'));
  })
);

export default router;
