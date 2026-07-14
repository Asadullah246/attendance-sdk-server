import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { registry, createSuccessResponseSchema, ErrorResponseSchema } from '../../config/swagger';

extendZodWithOpenApi(z);

export const GetReportsQuerySchema = z.object({
  date: z.string().optional().openapi({ description: 'Specific date (YYYY-MM-DD)', example: '2023-10-25' }),
  uid: z.number().int().optional().openapi({ description: 'Employee UID', example: 1001 }),
  status: z.string().optional().openapi({ description: 'Filter by status (PRESENT, ABSENT, LATE, etc.)', example: 'LATE' }),
  dateFrom: z.string().optional().openapi({ description: 'Start date for range', example: '2023-10-01' }),
  dateTo: z.string().optional().openapi({ description: 'End date for range', example: '2023-10-31' })
});

export const GenerateSummaryQuerySchema = z.object({
  dateFrom: z.string().openapi({ description: 'Start date', example: '2023-10-01' }),
  dateTo: z.string().openapi({ description: 'End date', example: '2023-10-31' }),
  uid: z.number().int().openapi({ description: 'Employee UID', example: 1001 })
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
  uid: z.number().int().openapi({ example: 1001 }),
  scheduleDate: z.string().openapi({ example: '2023-10-25T00:00:00.000Z' }),
  timetableId: z.number().int().openapi({ example: 1 }),
  actualCheckIn: z.string().nullable().openapi({ example: '2023-10-25T08:55:00Z' }),
  actualCheckOut: z.string().nullable().openapi({ example: '2023-10-25T17:05:00Z' }),
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
  uid: z.number().int().openapi({ example: 1001 }),
  totalWorkingMinutes: z.number().int().openapi({ example: 9600 }),
  totalLateMinutes: z.number().int().openapi({ example: 45 }),
  totalEarlyLeaveMinutes: z.number().int().openapi({ example: 0 }),
  totalOvertimeMinutes: z.number().int().openapi({ example: 120 }),
  daysPresent: z.number().int().openapi({ example: 20 }),
  daysAbsent: z.number().int().openapi({ example: 2 })
}).openapi('AttendanceSummary');

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
  request: { query: GetReportsQuerySchema },
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
  request: { query: GenerateSummaryQuerySchema },
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
