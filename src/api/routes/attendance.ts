import { Router, Request, Response } from 'express';
import { getPrisma } from '../../database/prisma';
import { successResponse, errorResponse } from '../../utils/helpers';
import logger from '../../utils/logger';

const router = Router();
const prisma = getPrisma();

const asyncHandler = (fn: Function) => (req: Request, res: Response, next: Function) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * GET /api/v1/attendance
 * Fetch attendance logs, optionally filtered
 */
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const { sn, limit = '100' } = req.query;
  
  const whereClause: any = {};
  if (sn && typeof sn === 'string') {
    whereClause.deviceSn = sn;
  }

  const limitNum = parseInt(limit as string, 10);

  const logs = await prisma.attendanceLog.findMany({
    where: whereClause,
    orderBy: { punchTime: 'desc' },
    take: isNaN(limitNum) ? 100 : limitNum,
  });

  res.json(successResponse(logs, 'Attendance logs fetched successfully'));
}));

export default router;
