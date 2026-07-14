import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { registry, createSuccessResponseSchema, ErrorResponseSchema } from '../../config/swagger';

extendZodWithOpenApi(z);

export const GetDailyReportsQuerySchema = z.object({
  date: z.string().optional().openapi({ description: 'Specific date (YYYY-MM-DD)', example: '2023-10-25' }),
  employeeId: z.string().optional().openapi({ description: 'Employee ID', example: 'EMP1001' }),
  status: z.string().optional().openapi({ description: 'Attendance status (e.g., PRESENT, LATE)', example: 'LATE' }),
  dateFrom: z.string().optional().openapi({ description: 'Start date (YYYY-MM-DD)', example: '2023-10-01' }),
  dateTo: z.string().optional().openapi({ description: 'End date (YYYY-MM-DD)', example: '2023-10-31' })
});

export const GetSummaryQuerySchema = z.object({
  employeeId: z.string().openapi({ description: 'Employee ID', example: 'EMP1001' }),
  dateFrom: z.string().optional().openapi({ description: 'Start date (YYYY-MM-DD)', example: '2023-10-01' }),
  dateTo: z.string().optional().openapi({ description: 'End date (YYYY-MM-DD)', example: '2023-10-31' })
});

export const CalculateReportsBodySchema = z.object({
  date: z.string().openapi({ description: 'Date to calculate (YYYY-MM-DD)', example: '2023-10-25' })
});

export const OverrideReportBodySchema = z.object({
  status: z.string().optional().openapi({ example: 'PRESENT' }),
  workingMinutes: z.number().int().optional().openapi({ example: 480 }),
  overtimeMinutes: z.number().int().optional().openapi({ example: 60 }),
  manualOvertimeMinutes: z.number().int().optional().openapi({ example: 60 }),
  manualNote: z.string().optional().openapi({ example: 'Approved by HR' })
});

export const ReportIdParamSchema = z.object({
  id: z.string().openapi({ description: 'Report ID', example: '1' })
});

export const ReportSchema = z.object({
  id: z.number().int().openapi({ example: 1 }),
  employeeId: z.string().openapi({ example: 'EMP1001' }),
  employeeDeviceUid: z.number().int().openapi({ example: 1 }),
  scheduleDate: z.string().openapi({ example: '2023-10-25T00:00:00Z' }),
  timetableId: z.number().int().openapi({ example: 1 }),
  actualCheckIn: z.string().nullable().openapi({ example: '2023-10-25T08:00:00Z' }),
  actualCheckOut: z.string().nullable().openapi({ example: '2023-10-25T17:00:00Z' }),
  workingMinutes: z.number().int().openapi({ example: 540 }),
  lateMinutes: z.number().int().openapi({ example: 0 }),
  earlyLeaveMinutes: z.number().int().openapi({ example: 0 }),
  overtimeMinutes: z.number().int().openapi({ example: 0 }),
  breakMinutes: z.number().int().openapi({ example: 0 }),
  middlePunchCount: z.number().int().openapi({ example: 0 }),
  status: z.string().openapi({ example: 'PRESENT' }),
  anomalyNotes: z.string().nullable().openapi({ example: null }),
  isManualOverride: z.boolean().openapi({ example: false }),
  manualOvertimeMinutes: z.number().int().openapi({ example: 0 }),
  manualNote: z.string().nullable().openapi({ example: null }),
  createdAt: z.string().openapi({ example: '2023-10-25T08:00:01Z' }),
  updatedAt: z.string().openapi({ example: '2023-10-25T08:00:01Z' })
}).openapi('DailyAttendanceReport');

export const SummarySchema = z.object({
  employeeId: z.string().openapi({ example: 'EMP1001' }),
  totalDays: z.number().int().openapi({ example: 22 }),
  totalPresentDays: z.number().int().openapi({ example: 20 }),
  totalAbsentDays: z.number().int().openapi({ example: 1 }),
  totalLateDays: z.number().int().openapi({ example: 1 }),
  totalEarlyLeaveDays: z.number().int().openapi({ example: 0 }),
  totalMissingPunchDays: z.number().int().openapi({ example: 0 }),
  totalWorkingMinutes: z.number().int().openapi({ example: 10800 }),
  totalLateMinutes: z.number().int().openapi({ example: 15 }),
  totalOvertimeMinutes: z.number().int().openapi({ example: 120 }),
  totalManualOvertimeMinutes: z.number().int().openapi({ example: 0 })
}).openapi('Summary');

export const CalculationResultSchema = z.object({
  calculatedCount: z.number().int().openapi({ example: 50 }),
  absentCount: z.number().int().openapi({ example: 2 })
}).openapi('CalculationResult');


// Registering Paths
registry.registerPath({
  method: 'get',
  path: '/api/v1/reports/daily',
  summary: 'Get daily attendance reports',
  tags: ['Reports'],
  security: [{ ApiKeyAuth: [] }],
  request: { query: GetDailyReportsQuerySchema },
  responses: {
    200: {
      description: 'Reports fetched successfully',
      content: {
        'application/json': {
          schema: createSuccessResponseSchema(z.array(ReportSchema))
        }
      }
    }
  }
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/reports/summary',
  summary: 'Get monthly or range summary per employee',
  tags: ['Reports'],
  security: [{ ApiKeyAuth: [] }],
  request: { query: GetSummaryQuerySchema },
  responses: {
    200: {
      description: 'Summary generated successfully',
      content: {
        'application/json': {
          schema: createSuccessResponseSchema(SummarySchema)
        }
      }
    },
    400: {
      description: 'Bad request',
      content: {
        'application/json': {
          schema: ErrorResponseSchema
        }
      }
    }
  }
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/reports/calculate',
  summary: 'Manually trigger calculation for a specific date',
  tags: ['Reports'],
  security: [{ ApiKeyAuth: [] }],
  request: { body: { content: { 'application/json': { schema: CalculateReportsBodySchema } } } },
  responses: {
    200: {
      description: 'Calculation triggered successfully',
      content: {
        'application/json': {
          schema: createSuccessResponseSchema(CalculationResultSchema)
        }
      }
    },
    400: {
      description: 'Bad request',
      content: {
        'application/json': {
          schema: ErrorResponseSchema
        }
      }
    }
  }
});

registry.registerPath({
  method: 'put',
  path: '/api/v1/reports/{id}/override',
  summary: 'HR manual override for a specific report',
  tags: ['Reports'],
  security: [{ ApiKeyAuth: [] }],
  request: { 
    params: ReportIdParamSchema,
    body: { content: { 'application/json': { schema: OverrideReportBodySchema } } } 
  },
  responses: {
    200: {
      description: 'Report overridden successfully',
      content: {
        'application/json': {
          schema: createSuccessResponseSchema(ReportSchema)
        }
      }
    },
    400: {
      description: 'Invalid report ID',
      content: {
        'application/json': {
          schema: ErrorResponseSchema
        }
      }
    }
  }
});
