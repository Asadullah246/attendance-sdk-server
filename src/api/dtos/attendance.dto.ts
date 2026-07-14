import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { registry, SuccessResponseSchema } from '../../config/swagger';

extendZodWithOpenApi(z);

export const GetAttendanceQuerySchema = z.object({
  sn: z.string().optional().openapi({ description: 'Device Serial Number', example: 'SN12345' }),
  uid: z.string().optional().openapi({ description: 'Employee Device UID', example: '1' }),
  dateFrom: z.string().optional().openapi({ description: 'Start date (YYYY-MM-DD)', example: '2023-10-01' }),
  dateTo: z.string().optional().openapi({ description: 'End date (YYYY-MM-DD)', example: '2023-10-31' }),
  excludeDuplicates: z.string().optional().openapi({ description: 'Filter out duplicate punches (true/false)', example: 'true' }),
  limit: z.string().optional().openapi({ description: 'Number of records to return', example: '100' })
});

// Registering Paths
registry.registerPath({
  method: 'get',
  path: '/api/v1/attendance',
  summary: 'Fetch attendance logs, optionally filtered',
  tags: ['Attendance'],
  security: [{ ApiKeyAuth: [] }],
  request: { query: GetAttendanceQuerySchema },
  responses: {
    200: {
      description: 'Attendance logs fetched successfully',
      content: {
        'application/json': {
          schema: SuccessResponseSchema
        }
      }
    }
  }
});
