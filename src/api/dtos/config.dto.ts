import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { registry, SuccessResponseSchema, ErrorResponseSchema } from '../../config/swagger';

extendZodWithOpenApi(z);

export const GetConfigParamsSchema = z.object({
  key: z.string().openapi({ description: 'The configuration key', example: 'timezone' })
});

export const UpdateConfigBodySchema = z.object({
  value: z.string().openapi({ description: 'The configuration value', example: 'Asia/Dhaka' }),
  description: z.string().optional().openapi({ description: 'Optional description for the config', example: 'System timezone' })
});

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
          schema: SuccessResponseSchema
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
          schema: SuccessResponseSchema
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
