import {
  OpenAPIRegistry,
  OpenApiGeneratorV3,
  extendZodWithOpenApi,
} from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

extendZodWithOpenApi(z);

export const registry = new OpenAPIRegistry();

// Define API Key security scheme
export const apiKeyAuth = registry.registerComponent(
  'securitySchemes',
  'ApiKeyAuth',
  {
    type: 'apiKey',
    in: 'header',
    name: 'x-api-key',
    description: 'API Key for accessing protected endpoints',
  }
);

// Generic Success Response Schema
export const SuccessResponseSchema = z.object({
  success: z.boolean().openapi({ example: true }),
  data: z.any().optional().openapi({ description: 'The response payload' }),
  message: z.string().openapi({ example: 'Operation completed successfully' }),
}).openapi('SuccessResponse');

registry.register('SuccessResponse', SuccessResponseSchema);

// Generic Error Response Schema
export const ErrorResponseSchema = z.object({
  success: z.boolean().openapi({ example: false }),
  message: z.string().openapi({ example: 'Error description message' }),
  error: z.any().optional().openapi({ description: 'Detailed error info' }),
}).openapi('ErrorResponse');

registry.register('ErrorResponse', ErrorResponseSchema);


export function generateSwaggerSpec() {
  const generator = new OpenApiGeneratorV3(registry.definitions);

  return generator.generateDocument({
    openapi: '3.0.0',
    info: {
      version: '1.0.0',
      title: 'ZKTeco SDK Middleware API',
      description: 'API documentation for the ZKTeco SDK Middleware Server. This API bridges ZKTeco biometric devices with external systems, handling device registration, real-time push data, shift management, and attendance calculations.',
    },
    servers: [{ url: 'http://localhost:8081', description: 'Development server' }],
  });
}
