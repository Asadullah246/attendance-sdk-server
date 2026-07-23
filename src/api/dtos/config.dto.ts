import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { registry, createSuccessResponseSchema, ErrorResponseSchema } from '../../config/swagger';

extendZodWithOpenApi(z);

export const GetConfigParamsSchema = z.object({
  key: z.string().openapi({ description: 'The configuration key', example: 'timezone' })
});

export const UpdateConfigBodySchema = z.object({
  value: z.string().openapi({ description: 'Configuration value', example: '10' }),
  description: z.string().optional().openapi({ description: 'Optional description', example: 'System timezone offset' })
});

export const ConfigSchema = z.object({
  id: z.number().int().openapi({ example: 1 }),
  key: z.string().openapi({ example: 'TIMEZONE' }),
  value: z.string().openapi({ example: '+06:00' }),
  description: z.string().nullable().openapi({ example: 'System timezone' }),
  updatedAt: z.string().openapi({ example: '2023-10-25T08:00:01Z' })
}).openapi('SystemConfig');

// Registering Paths
registry.registerPath({
  method: 'get',
  path: '/api/v1/configs',
  summary: 'Fetch all system configs',
  tags: ['Configs'],
  security: [{ ApiKeyAuth: [] }],
  responses: {
    200: {
      description: 'Configs fetched successfully',
      content: {
        'application/json': {
          schema: createSuccessResponseSchema(z.array(ConfigSchema))
        }
      }
    }
  }
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/configs/{key}',
  summary: 'Fetch a specific config',
  tags: ['Configs'],
  security: [{ ApiKeyAuth: [] }],
  request: {
    params: GetConfigParamsSchema
  },
  responses: {
    200: {
      description: 'Config fetched successfully',
      content: {
        'application/json': {
          schema: createSuccessResponseSchema(ConfigSchema)
        }
      }
    },
    404: {
      description: 'Config not found',
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
  path: '/api/v1/configs/{key}',
  summary: 'Create or update a config',
  tags: ['Configs'],
  security: [{ ApiKeyAuth: [] }],
  request: {
    params: GetConfigParamsSchema,
    body: {
      content: {
        'application/json': {
          schema: UpdateConfigBodySchema
        }
      }
    }
  },
  responses: {
    200: {
      description: 'Config updated successfully',
      content: {
        'application/json': {
          schema: createSuccessResponseSchema(ConfigSchema)
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
