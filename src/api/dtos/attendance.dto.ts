import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { registry, createSuccessResponseSchema, ErrorResponseSchema } from '../../config/swagger';

extendZodWithOpenApi(z);

export const GetAttendanceQuerySchema = z.object({
  sn: z.string().optional().openapi({ description: 'Device Serial Number', example: 'SN12345' }),
  uid: z.string().optional().openapi({ description: 'Employee Device UID', example: '1' }),
  dateFrom: z.string().optional().openapi({ description: 'Start date (YYYY-MM-DD)', example: '2023-10-01' }),
  dateTo: z.string().optional().openapi({ description: 'End date (YYYY-MM-DD)', example: '2023-10-31' }),
  excludeDuplicates: z.string().optional().openapi({ description: 'Filter out duplicate punches (true/false)', example: 'true' }),
  page: z.string().optional().openapi({ description: 'Page number for pagination', example: '1' }),
  limit: z.string().optional().openapi({ description: 'Number of records to return', example: '100' })
});

export const CreateAttendanceBodySchema = z.object({
  deviceSn: z.string().optional().openapi({ description: 'Device Serial Number (optional for manual punch)', example: 'MANUAL' }),
  uid: z.number().int().openapi({ description: 'Employee Device UID', example: 1 }),
  punchTime: z.string().openapi({ description: 'Punch Time (ISO string)', example: '2023-10-25T08:00:00Z' }),
  status: z.number().int().optional().openapi({ description: 'Punch State (0=Check-in, 1=Check-out)', example: 0 }),
  verifyType: z.number().int().optional().openapi({ description: 'Verification Type (1=Finger, 15=Face)', example: 1 }),
});

export const AttendanceLogSchema = z.object({
  id: z.number().int().openapi({ example: 1 }),
  deviceSn: z.string().openapi({ example: 'SN12345' }),
  uid: z.number().int().openapi({ example: 1 }),
  punchTime: z.string().openapi({ example: '2023-10-25T08:00:00Z' }),
  punchState: z.string().openapi({ example: '0' }),
  verifyType: z.number().int().openapi({ example: 1 }),
  workCode: z.string().openapi({ example: '0' }),
  isDuplicate: z.boolean().openapi({ example: false }),
  rawData: z.string().nullable().openapi({ example: null }),
  createdAt: z.string().openapi({ example: '2023-10-25T08:00:01Z' })
}).openapi('AttendanceLog');

// Registering Paths
registry.registerPath({
  method: 'get',
  path: '/api/v1/attendance',
  summary: 'Fetch attendance logs, optionally filtered',
  tags: ['Attendance'],
  security: [{ ApiKeyAuth: [] }],
  request: { query: GetAttendanceQuerySchema },
  responses: {
    200: {
      description: 'Attendance logs fetched successfully',
      content: {
        'application/json': {
          schema: createSuccessResponseSchema(z.union([
            z.array(AttendanceLogSchema),
            z.object({
              data: z.array(AttendanceLogSchema),
              meta: z.object({
                total: z.number().int(),
                page: z.number().int(),
                limit: z.number().int(),
                totalPages: z.number().int(),
              })
            })
          ]))
        }
      }
    }
  }
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/attendance',
  summary: 'Create a manual attendance log',
  tags: ['Attendance'],
  security: [{ ApiKeyAuth: [] }],
  request: {
    body: { content: { 'application/json': { schema: CreateAttendanceBodySchema } } }
  },
  responses: {
    200: {
      description: 'Attendance log created successfully',
      content: {
        'application/json': {
          schema: createSuccessResponseSchema(AttendanceLogSchema)
        }
      }
    }
  }
});
