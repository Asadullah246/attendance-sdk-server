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

export const BulkAssignScheduleBodySchema = z.object({
  uids: z.array(z.number().int()).openapi({ example: [1001, 1002] }),
  startDate: z.string().openapi({ description: 'Start Date (YYYY-MM-DD)', example: '2023-10-01' }),
  endDate: z.string().openapi({ description: 'End Date (YYYY-MM-DD)', example: '2023-10-31' }),
  timetableId: z.number().int().openapi({ example: 1 }),
  excludeDays: z.array(z.number().int()).optional().openapi({ description: 'Days of week to exclude (0=Sun, 6=Sat)', example: [0, 6] })
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
  path: '/api/v1/schedules',
  summary: 'Assign a single schedule',
  tags: ['Schedules'],
  security: [{ ApiKeyAuth: [] }],
  request: { body: { content: { 'application/json': { schema: AssignScheduleBodySchema } } } },
  responses: {
    200: {
      description: 'Schedule assigned successfully',
      content: {
        'application/json': {
          schema: createSuccessResponseSchema(ScheduleSchema)
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
