import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { registry, createSuccessResponseSchema, ErrorResponseSchema } from '../../config/swagger';

extendZodWithOpenApi(z);

export const HolidayIdParamSchema = z.object({
  id: z.string().openapi({ description: 'Holiday ID', example: '1' })
});

export const HolidaySchema = z.object({
  id: z.number().int().openapi({ example: 1 }),
  type: z.string().openapi({ example: 'global' }),
  name: z.string().openapi({ example: 'Christmas Day' }),
  startDate: z.string().openapi({ description: 'ISO Date', example: '2026-12-25T00:00:00.000Z' }),
  endDate: z.string().openapi({ description: 'ISO Date', example: '2026-12-25T00:00:00.000Z' }),
  description: z.string().nullable().openapi({ example: 'Public holiday' }),
  createdAt: z.string().openapi({ example: '2026-08-01T08:00:01Z' }),
  updatedAt: z.string().openapi({ example: '2026-08-01T08:00:01Z' })
}).openapi('Holiday');

export const CreateHolidayBodySchema = z.object({
  type: z.string().optional().openapi({ example: 'global' }),
  name: z.string().openapi({ example: 'Christmas Day' }),
  startDate: z.string().openapi({ description: 'YYYY-MM-DD', example: '2026-12-25' }),
  endDate: z.string().openapi({ description: 'YYYY-MM-DD', example: '2026-12-25' }),
  description: z.string().optional().openapi({ example: 'Public holiday' })
});

export const UpdateHolidayBodySchema = z.object({
  type: z.string().optional().openapi({ example: 'global' }),
  name: z.string().optional().openapi({ example: 'Christmas Day' }),
  startDate: z.string().optional().openapi({ description: 'YYYY-MM-DD', example: '2026-12-25' }),
  endDate: z.string().optional().openapi({ description: 'YYYY-MM-DD', example: '2026-12-25' }),
  description: z.string().optional().openapi({ example: 'Public holiday' })
});

// Registering Paths
registry.registerPath({
  method: 'get',
  path: '/api/v1/holidays',
  summary: 'List all holidays',
  tags: ['Holidays'],
  security: [{ ApiKeyAuth: [] }],
  responses: {
    200: {
      description: 'Holidays fetched successfully',
      content: {
        'application/json': {
          schema: createSuccessResponseSchema(z.array(HolidaySchema))
        }
      }
    }
  }
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/holidays',
  summary: 'Create a new holiday',
  tags: ['Holidays'],
  security: [{ ApiKeyAuth: [] }],
  request: {
    body: { content: { 'application/json': { schema: CreateHolidayBodySchema } } }
  },
  responses: {
    200: {
      description: 'Holiday created successfully',
      content: {
        'application/json': {
          schema: createSuccessResponseSchema(HolidaySchema)
        }
      }
    }
  }
});

registry.registerPath({
  method: 'delete',
  path: '/api/v1/holidays/{id}',
  summary: 'Delete a holiday',
  tags: ['Holidays'],
  security: [{ ApiKeyAuth: [] }],
  request: { params: HolidayIdParamSchema },
  responses: {
    200: {
      description: 'Holiday deleted successfully',
      content: {
        'application/json': {
          schema: createSuccessResponseSchema(z.null())
        }
      }
    }
  }
});
