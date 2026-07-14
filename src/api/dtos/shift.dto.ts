import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { registry, SuccessResponseSchema, ErrorResponseSchema } from '../../config/swagger';

extendZodWithOpenApi(z);

export const ShiftIdParamSchema = z.object({
  id: z.string().openapi({ description: 'The shift ID', example: '1' })
});

export const CreateShiftBodySchema = z.object({
  name: z.string().openapi({ example: 'Morning Shift' }),
  shiftStartTime: z.string().openapi({ example: '09:00' }),
  shiftEndTime: z.string().openapi({ example: '18:00' }),
  checkInStartOffset: z.number().int().openapi({ example: 420 }),
  checkInEndOffset: z.number().int().openapi({ example: 600 }),
  checkOutStartOffset: z.number().int().openapi({ example: 1020 }),
  checkOutEndOffset: z.number().int().openapi({ example: 1200 }),
  graceMinutes: z.number().int().openapi({ example: 15 }),
  breakMinutes: z.number().int().openapi({ example: 60 }),
  overtimeThresholdMinutes: z.number().int().openapi({ example: 60 })
});

export const UpdateShiftBodySchema = CreateShiftBodySchema.partial();

// Registering Paths
registry.registerPath({
  method: 'get',
  path: '/api/v1/shifts',
  summary: 'List all active shift timetables',
  tags: ['Shifts'],
  security: [{ ApiKeyAuth: [] }],
  responses: {
    200: {
      description: 'Shifts fetched successfully',
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
  path: '/api/v1/shifts/{id}',
  summary: 'Get single shift with human-readable times',
  tags: ['Shifts'],
  security: [{ ApiKeyAuth: [] }],
  request: { params: ShiftIdParamSchema },
  responses: {
    200: {
      description: 'Shift fetched successfully',
      content: {
        'application/json': {
          schema: SuccessResponseSchema
        }
      }
    },
    404: {
      description: 'Shift not found',
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
  path: '/api/v1/shifts',
  summary: 'Create a new shift timetable',
  tags: ['Shifts'],
  security: [{ ApiKeyAuth: [] }],
  request: {
    body: { content: { 'application/json': { schema: CreateShiftBodySchema } } }
  },
  responses: {
    200: {
      description: 'Shift created successfully',
      content: {
        'application/json': {
          schema: SuccessResponseSchema
        }
      }
    }
  }
});

registry.registerPath({
  method: 'put',
  path: '/api/v1/shifts/{id}',
  summary: 'Update a shift timetable',
  tags: ['Shifts'],
  security: [{ ApiKeyAuth: [] }],
  request: {
    params: ShiftIdParamSchema,
    body: { content: { 'application/json': { schema: UpdateShiftBodySchema } } }
  },
  responses: {
    200: {
      description: 'Shift updated successfully',
      content: {
        'application/json': {
          schema: SuccessResponseSchema
        }
      }
    }
  }
});

registry.registerPath({
  method: 'delete',
  path: '/api/v1/shifts/{id}',
  summary: 'Soft delete a shift timetable',
  tags: ['Shifts'],
  security: [{ ApiKeyAuth: [] }],
  request: { params: ShiftIdParamSchema },
  responses: {
    200: {
      description: 'Shift deleted successfully',
      content: {
        'application/json': {
          schema: SuccessResponseSchema
        }
      }
    }
  }
});
