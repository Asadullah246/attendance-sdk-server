import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { registry, SuccessResponseSchema, ErrorResponseSchema } from '../../config/swagger';

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
          schema: SuccessResponseSchema
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
          schema: SuccessResponseSchema
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
          schema: SuccessResponseSchema
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
          schema: SuccessResponseSchema
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
