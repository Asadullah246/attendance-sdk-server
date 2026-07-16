import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { registry, createSuccessResponseSchema, ErrorResponseSchema } from '../../config/swagger';

extendZodWithOpenApi(z);

export const DeviceSchema = z.object({
  id: z.number().int().openapi({ example: 1 }),
  serialNumber: z.string().openapi({ example: 'B5XX23412345' }),
  name: z.string().nullable().optional().openapi({ example: 'Main Gate' }),
  areaId: z.number().int().nullable().optional().openapi({ example: 1 }),
  isOnline: z.boolean().openapi({ example: true }),
  lastActivity: z.string().nullable().optional().openapi({ example: '2023-10-25T08:00:01Z' }),
  createdAt: z.string().openapi({ example: '2023-10-25T08:00:01Z' }),
  updatedAt: z.string().openapi({ example: '2023-10-25T08:00:01Z' })
}).openapi('Device');

export const UpdateDeviceBodySchema = z.object({
  name: z.string().optional().openapi({ description: 'New name for the device' }),
  areaId: z.number().int().nullable().optional().openapi({ description: 'Assign device to a new Area ID (or null for Global)' })
});

export const SyncStatusResponseSchema = z.object({
  pendingCount: z.number().int().openapi({ example: 5 }),
  pendingUsers: z.array(z.object({
    uid: z.number().int().openapi({ example: 1001 }),
    name: z.string().openapi({ example: 'John Doe' })
  }))
});

export const RetrySyncResponseSchema = z.object({
  queuedCount: z.number().int().openapi({ example: 5 })
});

// Registering Paths

registry.registerPath({
  method: 'get',
  path: '/api/v1/devices',
  summary: 'Get a list of all devices',
  tags: ['Devices'],
  security: [{ ApiKeyAuth: [] }],
  responses: {
    200: {
      description: 'Devices fetched successfully',
      content: {
        'application/json': {
          schema: createSuccessResponseSchema(z.array(DeviceSchema))
        }
      }
    }
  }
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/devices/{sn}',
  summary: 'Get details of a single device',
  tags: ['Devices'],
  security: [{ ApiKeyAuth: [] }],
  request: {
    params: z.object({ sn: z.string().openapi({ example: 'B5XX23412345' }) })
  },
  responses: {
    200: {
      description: 'Device fetched successfully',
      content: {
        'application/json': {
          schema: createSuccessResponseSchema(DeviceSchema)
        }
      }
    },
    404: {
      description: 'Device not found',
      content: { 'application/json': { schema: ErrorResponseSchema } }
    }
  }
});

registry.registerPath({
  method: 'patch',
  path: '/api/v1/devices/{sn}',
  summary: 'Update device and trigger user sync for its area',
  tags: ['Devices'],
  security: [{ ApiKeyAuth: [] }],
  request: {
    params: z.object({ sn: z.string().openapi({ example: 'B5XX23412345' }) }),
    body: { content: { 'application/json': { schema: UpdateDeviceBodySchema } } }
  },
  responses: {
    200: {
      description: 'Device updated successfully',
      content: {
        'application/json': {
          schema: createSuccessResponseSchema(DeviceSchema)
        }
      }
    },
    404: {
      description: 'Device not found',
      content: { 'application/json': { schema: ErrorResponseSchema } }
    }
  }
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/devices/{sn}/sync-status',
  summary: 'Get the list of users pending sync for a device',
  tags: ['Devices'],
  security: [{ ApiKeyAuth: [] }],
  request: {
    params: z.object({ sn: z.string().openapi({ example: 'B5XX23412345' }) })
  },
  responses: {
    200: {
      description: 'Sync status fetched successfully',
      content: {
        'application/json': {
          schema: createSuccessResponseSchema(SyncStatusResponseSchema)
        }
      }
    },
    404: {
      description: 'Device not found',
      content: { 'application/json': { schema: ErrorResponseSchema } }
    }
  }
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/devices/{sn}/retry-sync',
  summary: 'Re-queue sync commands for all pending users on a device',
  tags: ['Devices'],
  security: [{ ApiKeyAuth: [] }],
  request: {
    params: z.object({ sn: z.string().openapi({ example: 'B5XX23412345' }) })
  },
  responses: {
    200: {
      description: 'Users re-queued for sync successfully',
      content: {
        'application/json': {
          schema: createSuccessResponseSchema(RetrySyncResponseSchema)
        }
      }
    },
    404: {
      description: 'Device not found',
      content: { 'application/json': { schema: ErrorResponseSchema } }
    }
  }
});
