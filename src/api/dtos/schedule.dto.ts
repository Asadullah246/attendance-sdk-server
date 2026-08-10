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
  uid: z.union([z.number().int(), z.string().transform((val) => parseInt(val, 10))]).openapi({ example: 105 }),
  timetableId: z.union([z.number().int(), z.string().transform((val) => parseInt(val, 10))]).openapi({ example: 1 }),
  scheduleDate: z.string().openapi({ description: 'Date (YYYY-MM-DD)', example: '2026-08-01' })
});

export const BulkAssignScheduleBodySchema = z.union([
  z.object({
    uids: z.array(z.union([z.number().int(), z.string().transform((val) => parseInt(val, 10))])).openapi({ example: [202601002, 202601001] }),
    timetableId: z.union([z.number().int(), z.string().transform((val) => parseInt(val, 10))]).openapi({ example: 1 }),
    dateFrom: z.string().openapi({ description: 'Start date (YYYY-MM-DD)', example: '2026-07-01' }),
    dateTo: z.string().openapi({ description: 'End date (YYYY-MM-DD)', example: '2026-12-25' })
  }),
  z.object({
    schedules: z.array(BulkAssignScheduleItemSchema).openapi({ 
      description: 'Array of specific shift assignments.',
      example: [
        { uid: 105, timetableId: 1, scheduleDate: '2026-08-01' }
      ]
    })
  })
]);

export const ScheduleIdParamSchema = z.object({
  id: z.string().openapi({ description: 'Schedule ID', example: '1' })
});

export const BulkDeleteScheduleBodySchema = z.object({
  ids: z.array(z.number().int()).min(1).openapi({
    description: 'Array of schedule IDs to delete',
    example: [1, 2, 3]
  })
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
