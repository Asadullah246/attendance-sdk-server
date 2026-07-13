import fs from 'fs';
import path from 'path';
import logger from './logger';

// Since this runs via tsx in src/utils, we go up two levels.
// If it was compiled to dist/utils, it would be the same relative to project root.
const DATA_DIR = path.resolve(process.cwd(), 'datas');

// Ensure datas directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

/**
 * Saves incoming device push data to a JSON file for analysis
 * @param endpoint The API endpoint (e.g., 'cdata', 'getrequest')
 * @param method HTTP method
 * @param query Query parameters from the request
 * @param body Parsed or raw body from the request
 * @param sn Device Serial Number (if available)
 */
export function saveDeviceData(
  endpoint: string,
  method: string,
  query: unknown,
  body: unknown,
  sn?: string
): void {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const devicePrefix = sn ? `${sn}_` : '';
    const safeEndpoint = endpoint.replace(/[^a-zA-Z0-9]/g, '_');
    const filename = `${timestamp}_${devicePrefix}${method}_${safeEndpoint}.json`;
    const filePath = path.join(DATA_DIR, filename);

    const dataToSave = {
      timestamp: new Date().toISOString(),
      method,
      endpoint,
      sn,
      query,
      body,
    };

    fs.writeFileSync(filePath, JSON.stringify(dataToSave, null, 2), 'utf-8');
    logger.debug(`Saved device data to ${filename}`);
  } catch (error) {
    logger.error('Failed to save device data to datas folder', {
      error: (error as Error).message,
    });
  }
}
