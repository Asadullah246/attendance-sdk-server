import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { registry, createSuccessResponseSchema, ErrorResponseSchema } from '../../config/swagger';

extendZodWithOpenApi(z);

export const ShiftIdParamSchema = z.object({
  id: z.string().openapi({ description: 'Shift ID', example: '1' })
});

export const ShiftSchema = z.object({
  id: z.number().int().openapi({ example: 1 }),
  name: z.string().openapi({ example: 'Morning Shift' }),
  shiftStartTime: z.string().openapi({ example: '08:00' }),
  shiftEndTime: z.string().openapi({ example: '14:00' }),
  checkInStartTime: z.string().openapi({ example: '06:00' }),
  checkInEndTime: z.string().openapi({ example: '10:00' }),
  checkOutStartTime: z.string().openapi({ example: '13:00' }),
  checkOutEndTime: z.string().openapi({ example: '18:00' }),
  graceMinutes: z.number().int().openapi({ example: 15 }),
  overtimeThresholdMinutes: z.number().int().openapi({ example: 60 }),
  breakMinutes: z.number().int().openapi({ example: 0 }),
  isActive: z.boolean().openapi({ example: true }),
  createdAt: z.string().openapi({ example: '2026-08-01T08:00:01Z' }),
  updatedAt: z.string().openapi({ example: '2026-08-01T08:00:01Z' })
}).openapi('Shift');

export const CreateShiftBodySchema = z.object({
  name: z.string().openapi({ example: 'Morning Shift' }),
  shiftStartTime: z.string().openapi({ example: '09:00' }),
  shiftEndTime: z.string().openapi({ example: '17:00' }),
  checkInStartTime: z.string().openapi({ example: '07:00' }),
  checkInEndTime: z.string().openapi({ example: '11:00' }),
  checkOutStartTime: z.string().openapi({ example: '16:00' }),
  checkOutEndTime: z.string().openapi({ example: '20:00' }),
  graceMinutes: z.number().int().optional().openapi({ example: 15 }),
  breakMinutes: z.number().int().optional().openapi({ example: 60 }),
  overtimeThresholdMinutes: z.number().int().optional().openapi({ example: 60 })
});

export const UpdateShiftBodySchema = z.object({
  name: z.string().optional().openapi({ example: 'Morning Shift' }),
  shiftStartTime: z.string().optional().openapi({ example: '09:00' }),
  shiftEndTime: z.string().optional().openapi({ example: '17:00' }),
  checkInStartTime: z.string().optional().openapi({ example: '07:00' }),
  checkInEndTime: z.string().optional().openapi({ example: '11:00' }),
  checkOutStartTime: z.string().optional().openapi({ example: '16:00' }),
  checkOutEndTime: z.string().optional().openapi({ example: '20:00' }),
  graceMinutes: z.number().int().optional().openapi({ example: 15 }),
  breakMinutes: z.number().int().optional().openapi({ example: 60 }),
  overtimeThresholdMinutes: z.number().int().optional().openapi({ example: 60 }),
  isActive: z.boolean().optional().openapi({ example: true })
});

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
          schema: createSuccessResponseSchema(z.array(ShiftSchema))
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
          schema: createSuccessResponseSchema(ShiftSchema)
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
          schema: createSuccessResponseSchema(ShiftSchema)
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
          schema: createSuccessResponseSchema(ShiftSchema)
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
          schema: createSuccessResponseSchema(z.null())
        }
      }
    }
  }
});
