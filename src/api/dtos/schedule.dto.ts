import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { registry, createSuccessResponseSchema, ErrorResponseSchema } from '../../config/swagger';

extendZodWithOpenApi(z);

export const GetSchedulesQuerySchema = z.object({
  date: z.string().optional().openapi({ description: 'Specific date (YYYY-MM-DD)', example: '2023-10-25' }),
  uid: z.number().int().optional().openapi({ description: 'Employee UID', example: 1001 }),
  dateFrom: z.string().optional().openapi({ description: 'Start date (YYYY-MM-DD)', example: '2023-10-01' }),
  dateTo: z.string().optional().openapi({ description: 'End date (YYYY-MM-DD)', example: '2023-10-31' })
});

export const AssignScheduleBodySchema = z.object({
  uid: z.number().int().openapi({ example: 1001 }),
  scheduleDate: z.string().openapi({ description: 'Date (YYYY-MM-DD)', example: '2023-10-25' }),
  timetableId: z.number().int().openapi({ example: 1 })
});

export const BulkAssignScheduleItemSchema = z.object({
  uid: z.number().int().openapi({ example: 105 }),
  timetableId: z.number().int().openapi({ example: 1 }),
  scheduleDate: z.string().openapi({ description: 'Date (YYYY-MM-DD)', example: '2026-08-01' })
});

export const BulkAssignScheduleBodySchema = z.object({
  schedules: z.array(BulkAssignScheduleItemSchema).openapi({ 
    description: 'Array of specific shift assignments. This allows for complex rotating shifts.',
    example: [
      { uid: 105, timetableId: 1, scheduleDate: '2026-08-01' },
      { uid: 105, timetableId: 2, scheduleDate: '2026-08-02' }
    ]
  })
});

export const ScheduleIdParamSchema = z.object({
  id: z.string().openapi({ description: 'Schedule ID', example: '1' })
});

import { ShiftSchema } from './shift.dto';

export const ScheduleSchema = z.object({
  id: z.number().int().openapi({ example: 1 }),
  uid: z.number().int().openapi({ example: 1001 }),
  timetableId: z.number().int().openapi({ example: 1 }),
  scheduleDate: z.string().openapi({ example: '2023-10-25T00:00:00.000Z' }),
  createdAt: z.string().openapi({ example: '2023-10-25T08:00:01Z' }),
  updatedAt: z.string().openapi({ example: '2023-10-25T08:00:01Z' }),
  timetable: ShiftSchema.optional()
}).openapi('EmployeeSchedule');

export const BulkScheduleResultSchema = z.object({
  count: z.number().int().openapi({ example: 5 })
}).openapi('BulkScheduleResult');

// Registering Paths
registry.registerPath({
  method: 'get',
  path: '/api/v1/schedules',
  summary: 'List schedules with filters',
  tags: ['Schedules'],
  security: [{ ApiKeyAuth: [] }],
  request: { query: GetSchedulesQuerySchema },
  responses: {
    200: {
      description: 'Schedules fetched successfully',
      content: {
        'application/json': {
          schema: createSuccessResponseSchema(z.array(ScheduleSchema))
        }
      }
    }
  }
});


registry.registerPath({
  method: 'post',
  path: '/api/v1/schedules/bulk',
  summary: 'Bulk assign schedules',
  tags: ['Schedules'],
  security: [{ ApiKeyAuth: [] }],
  request: { body: { content: { 'application/json': { schema: BulkAssignScheduleBodySchema } } } },
  responses: {
    200: {
      description: 'Schedules bulk assigned successfully',
      content: {
        'application/json': {
          schema: createSuccessResponseSchema(BulkScheduleResultSchema)
        }
      }
    }
  }
});

registry.registerPath({
  method: 'delete',
  path: '/api/v1/schedules/{id}',
  summary: 'Remove a schedule assignment',
  tags: ['Schedules'],
  security: [{ ApiKeyAuth: [] }],
  request: { params: ScheduleIdParamSchema },
  responses: {
    200: {
      description: 'Schedule removed successfully',
      content: {
        'application/json': {
          schema: createSuccessResponseSchema(z.null())
        }
      }
    }
  }
});
