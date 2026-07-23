import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { registry, createSuccessResponseSchema, ErrorResponseSchema } from '../../config/swagger';

extendZodWithOpenApi(z);

export const CreateUserBodySchema = z.object({
  uid: z.string().openapi({ description: 'The numeric user ID as string', example: '1001' }),
  name: z.string().openapi({ description: 'The user name', example: 'John Doe' }),
  privilege: z.string().optional().openapi({ description: 'Privilege level (0=User, 14=Admin)', example: '0' }),
  deviceSn: z.string().optional().openapi({ description: 'Specific device SN. If omitted, pushes to all devices', example: 'SN12345' }),
  defaultTimetableId: z.number().int().optional().openapi({ description: 'Default shift for this user', example: 1 })
});

export const DeleteUserParamSchema = z.object({
  uid: z.string().openapi({ description: 'The numeric user ID as string', example: '1001' })
});

export const UserSchema = z.object({
  id: z.number().int().openapi({ example: 1 }),
  uid: z.number().int().openapi({ example: 1001 }),
  name: z.string().openapi({ example: 'John Doe' }),
  cardNumber: z.string().nullable().optional().openapi({ example: '123456789' }),
  privilege: z.number().int().openapi({ example: 0 }),
  status: z.string().openapi({ example: 'enrolled' }),
  areaId: z.number().int().nullable().optional().openapi({ example: 1 }),
  defaultTimetableId: z.number().int().nullable().optional().openapi({ example: 1 }),
  createdAt: z.string().openapi({ example: '2023-10-25T08:00:01Z' }),
  updatedAt: z.string().openapi({ example: '2023-10-25T08:00:01Z' })
}).openapi('User');

export const UserCommandResponseSchema = z.object({
  user: UserSchema.optional(),
  commandId: z.string().optional().openapi({ example: 'cmd_12345' })
}).openapi('UserCommandResponse');

// Registering Paths
registry.registerPath({
  method: 'get',
  path: '/api/v1/users',
  summary: 'Fetch all enrolled users from the database',
  tags: ['Users'],
  security: [{ ApiKeyAuth: [] }],
  responses: {
    200: {
      description: 'Users fetched successfully',
      content: {
        'application/json': {
          schema: createSuccessResponseSchema(z.array(UserSchema))
        }
      }
    }
  }
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/users',
  summary: 'Creates a new user in the database AND pushes it to the specified device',
  tags: ['Users'],
  security: [{ ApiKeyAuth: [] }],
  request: {
    body: { content: { 'application/json': { schema: CreateUserBodySchema } } }
  },
  responses: {
    200: {
      description: 'User created successfully',
      content: {
        'application/json': {
          schema: createSuccessResponseSchema(UserCommandResponseSchema)
        }
      }
    },
    400: {
      description: 'Bad Request',
      content: {
        'application/json': {
          schema: ErrorResponseSchema
        }
      }
    }
  }
});

registry.registerPath({
  method: 'delete',
  path: '/api/v1/users/{uid}',
  summary: 'Deletes a user from the database AND removes them from the specified device',
  tags: ['Users'],
  security: [{ ApiKeyAuth: [] }],
  request: {
    params: DeleteUserParamSchema
  },
  responses: {
    200: {
      description: 'User deleted successfully',
      content: {
        'application/json': {
          schema: createSuccessResponseSchema(UserCommandResponseSchema)
        }
      }
    },
    400: {
      description: 'Bad Request',
      content: {
        'application/json': {
          schema: ErrorResponseSchema
        }
      }
    }
  }
});
