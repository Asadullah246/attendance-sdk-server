import dotenv from 'dotenv';
import path from 'path';

// Load .env file
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export interface AppConfig {
  port: number;
  nodeEnv: string;
  isDev: boolean;
  databaseUrl: string;
  apiKey: string;
  adminEmail: string;
  adminPassword: string;
  logLevel: string;
  logDir: string;
  defaultDeviceIp: string;
  defaultDevicePort: number;
  connectionTimeout: number;
  webhookSecret: string;
  mainAppWebhookUrl: string;
  timezone: string;
  deviceTimezoneOffset: string;
}

const config: AppConfig = {
  // Server
  port: parseInt(process.env.PORT || '8081', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  isDev: process.env.NODE_ENV !== 'production',

  // Database
  databaseUrl: process.env.DATABASE_URL || '',

  // API Security
  apiKey: process.env.API_KEY || 'zk-sdk-dev-key',
  adminEmail: process.env.ADMIN_EMAIL || 'admin@example.com',
  adminPassword: process.env.ADMIN_PASSWORD || 'securepassword123',

  // Logging
  logLevel: process.env.LOG_LEVEL || 'info',
  logDir: process.env.LOG_DIR || './logs',

  // Device Defaults
  defaultDeviceIp: process.env.DEFAULT_DEVICE_IP || '192.168.0.201',
  defaultDevicePort: parseInt(process.env.DEFAULT_DEVICE_PORT || '4370', 10),
  connectionTimeout: parseInt(process.env.CONNECTION_TIMEOUT || '5000', 10),

  // Webhooks
  webhookSecret: process.env.WEBHOOK_SECRET || '',
  mainAppWebhookUrl: process.env.MAIN_APP_WEBHOOK_URL || '',
  
  // Settings
  timezone: process.env.TIMEZONE || 'Asia/Dhaka',
  deviceTimezoneOffset: process.env.DEVICE_TIMEZONE_OFFSET || '+06:00',
};

export default config;
