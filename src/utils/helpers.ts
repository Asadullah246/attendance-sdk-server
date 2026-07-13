/**
 * Standardized API response types and utility helpers
 */

export interface ApiResponse<T = unknown> {
  success: boolean;
  message: string;
  data?: T;
  statusCode?: number;
  details?: unknown;
  timestamp: string;
}

/**
 * Format uptime seconds into human-readable string
 */
export function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  const parts: string[] = [];
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  parts.push(`${s}s`);

  return parts.join(' ');
}

/**
 * Create a standardized API success response
 */
export function successResponse<T>(data: T, message: string = 'Success'): ApiResponse<T> {
  return {
    success: true,
    message,
    data,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Create a standardized API error response
 */
export function errorResponse(
  message: string = 'Internal Server Error',
  statusCode: number = 500,
  details: unknown = null
): ApiResponse {
  const response: ApiResponse = {
    success: false,
    message,
    statusCode,
    timestamp: new Date().toISOString(),
  };
  if (details) response.details = details;
  return response;
}

/**
 * Validate an IP address format
 */
export function isValidIP(ip: string): boolean {
  const ipRegex = /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)$/;
  return ipRegex.test(ip);
}

/**
 * Sleep for a given number of milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
