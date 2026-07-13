import connectionManager from './connectionManager';
import logger from '../utils/logger';
import config from '../config';

/**
 * Result types for device operations
 */
export interface PingResult {
  reachable: boolean;
  ip: string;
  port: number;
  responseTime: string;
  error?: string;
}

export interface DeviceInfoResult {
  ip: string;
  port: number;
  info: Record<string, unknown>;
  retrievedAt: string;
}

export interface UsersResult {
  ip: string;
  count: number;
  users: unknown[];
  retrievedAt: string;
}

export interface AttendanceResult {
  ip: string;
  count: number;
  records: unknown[];
  retrievedAt: string;
}

export interface DeviceStatusResult {
  ip: string;
  port: number;
  info: Record<string, unknown> | null;
  userCount: number | null;
  attendanceCount: number | null;
  retrievedAt: string;
}

/**
 * High-level operations for ZKTeco devices via Pull SDK (TCP socket).
 * Each operation connects → performs action → disconnects.
 */
const operations = {
  /**
   * Quick connectivity test — connect, get basic info, disconnect
   */
  async ping(ip: string, port: number = config.defaultDevicePort): Promise<PingResult> {
    const startTime = Date.now();

    try {
      await connectionManager.connect(ip, port);
      await connectionManager.disconnect(ip, port);

      const elapsed = Date.now() - startTime;
      return {
        reachable: true,
        ip,
        port,
        responseTime: `${elapsed}ms`,
      };
    } catch (error) {
      const elapsed = Date.now() - startTime;
      return {
        reachable: false,
        ip,
        port,
        responseTime: `${elapsed}ms`,
        error: (error as Error).message,
      };
    }
  },

  /**
   * Get full device information
   */
  async getDeviceInfo(ip: string, port: number = config.defaultDevicePort): Promise<DeviceInfoResult> {
    try {
      const { device } = await connectionManager.connect(ip, port);

      const info = await device.getInfo();

      logger.info('Device info retrieved', { ip, info });

      await connectionManager.disconnect(ip, port);

      return {
        ip,
        port,
        info,
        retrievedAt: new Date().toISOString(),
      };
    } catch (error) {
      await connectionManager.disconnect(ip, port).catch(() => {});
      throw error;
    }
  },

  /**
   * Get all users enrolled on the device
   */
  async getUsers(ip: string, port: number = config.defaultDevicePort): Promise<UsersResult> {
    try {
      const { device } = await connectionManager.connect(ip, port);

      const users = await device.getUsers();

      logger.info(`Retrieved ${users?.data?.length || 0} users from ${ip}`);

      await connectionManager.disconnect(ip, port);

      return {
        ip,
        count: users?.data?.length || 0,
        users: users?.data || users || [],
        retrievedAt: new Date().toISOString(),
      };
    } catch (error) {
      await connectionManager.disconnect(ip, port).catch(() => {});
      throw error;
    }
  },

  /**
   * Get all attendance logs from the device
   */
  async getAttendances(ip: string, port: number = config.defaultDevicePort): Promise<AttendanceResult> {
    try {
      const { device } = await connectionManager.connect(ip, port);

      const attendances = await device.getAttendances();

      logger.info(`Retrieved ${attendances?.data?.length || 0} attendance records from ${ip}`);

      await connectionManager.disconnect(ip, port);

      return {
        ip,
        count: attendances?.data?.length || 0,
        records: attendances?.data || attendances || [],
        retrievedAt: new Date().toISOString(),
      };
    } catch (error) {
      await connectionManager.disconnect(ip, port).catch(() => {});
      throw error;
    }
  },

  /**
   * Get device real-time status (info + user count + attendance count)
   */
  async getDeviceStatus(ip: string, port: number = config.defaultDevicePort): Promise<DeviceStatusResult> {
    try {
      const { device } = await connectionManager.connect(ip, port);

      const [info, users, attendances] = await Promise.allSettled([
        device.getInfo(),
        device.getUsers(),
        device.getAttendances(),
      ]);

      await connectionManager.disconnect(ip, port);

      return {
        ip,
        port,
        info: info.status === 'fulfilled' ? info.value : null,
        userCount: users.status === 'fulfilled' ? (users.value?.data?.length || 0) : null,
        attendanceCount: attendances.status === 'fulfilled' ? (attendances.value?.data?.length || 0) : null,
        retrievedAt: new Date().toISOString(),
      };
    } catch (error) {
      await connectionManager.disconnect(ip, port).catch(() => {});
      throw error;
    }
  },
};

export default operations;
