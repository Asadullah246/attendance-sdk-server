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

/**
 * Convert HH:mm string to minutes since midnight
 */
export function timeStringToMinutes(timeStr: string): number {
  if (!/^\d{2}:\d{2}$/.test(timeStr)) {
    throw new Error(`Invalid time format. Expected HH:mm, got ${timeStr}`);
  }
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
}

/**
 * Convert minutes since midnight to HH:mm string
 */
export function minutesToTimeString(minutes: number): string {
  const normalized = ((minutes % 1440) + 1440) % 1440; // Handle negatives or > 24h
  const h = Math.floor(normalized / 60).toString().padStart(2, '0');
  const m = (Math.floor(normalized % 60)).toString().padStart(2, '0');
  return `${h}:${m}`;
}
